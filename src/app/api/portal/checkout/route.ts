/**
 * @route POST /api/portal/checkout
 * Body: { t: string; invoiceId: string }
 *
 * Patient-facing checkout. The portal token authorizes the action and
 * scopes it to that patient — we refuse to create a session for any
 * invoice that doesn't belong to the token's patient.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bypassTenantScope } from "@/lib/tenant-context";
import { getPaymentProvider } from "@/lib/payments";
import { logger } from "@/lib/logger";

const schema = z.object({
  t: z.string().min(1),
  invoiceId: z.string().min(1),
  amount: z.number().positive().optional(),
});

function originFromRequest(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch { return ""; }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "validation_failed" }, { status: 400 });
    }
    const { t, invoiceId } = parsed.data;

    const data = await bypassTenantScope(async () => {
      const tok = await prisma.patientPortalToken.findUnique({
        where: { token: t },
        select: { patientId: true, expiresAt: true, revokedAt: true },
      });
      if (!tok || tok.revokedAt || (tok.expiresAt && tok.expiresAt < new Date())) {
        return { error: "invalid_token" as const };
      }
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, patientId: tok.patientId },
        select: {
          id: true, invoiceNumber: true, balanceDue: true, status: true,
          tenantId: true,
          patient: { select: { firstName: true, lastName: true, email: true, phone: true } },
        },
      });
      if (!invoice) return { error: "invoice_not_found" as const };
      if (invoice.status === "PAID") return { error: "invoice_already_paid" as const };
      return { invoice };
    });

    if ("error" in data) {
      return NextResponse.json({ success: false, error: data.error }, { status: data.error === "invalid_token" ? 401 : 404 });
    }
    const invoice = data.invoice;
    const amount = parsed.data.amount ?? invoice.balanceDue;
    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, error: "nothing_to_pay" }, { status: 400 });
    }

    const provider = getPaymentProvider();
    const origin = originFromRequest(request);
    const successUrl = `${origin}/portal?t=${encodeURIComponent(t)}&paid=${invoice.id}`;
    const cancelUrl  = `${origin}/portal?t=${encodeURIComponent(t)}&cancelled=${invoice.id}`;

    const checkout = await provider.createCheckout({
      invoiceId: invoice.id,
      amount,
      currency: process.env.PAYMENT_DEFAULT_CURRENCY ?? "PKR",
      description: `Invoice ${invoice.invoiceNumber}`,
      successUrl, cancelUrl,
      customer: {
        name: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
        email: invoice.patient.email,
        phone: invoice.patient.phone,
      },
      metadata: { invoiceId: invoice.id, source: "portal" },
    });

    await bypassTenantScope(() =>
      prisma.paymentSession.create({
        data: {
          tenantId: invoice.tenantId ?? null,
          invoiceId: invoice.id,
          provider: provider.name,
          gatewayReference: checkout.reference,
          amount,
          currency: process.env.PAYMENT_DEFAULT_CURRENCY ?? "PKR",
          checkoutUrl: checkout.checkoutUrl,
          returnUrl: successUrl,
        },
      })
    );

    return NextResponse.json({ success: true, data: { checkoutUrl: checkout.checkoutUrl } }, { status: 201 });
  } catch (err) {
    logger.api("POST", "/api/portal/checkout", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "internal_error" },
      { status: 500 }
    );
  }
}
