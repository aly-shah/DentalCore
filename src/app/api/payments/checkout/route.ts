/**
 * @route POST /api/payments/checkout
 * Body: { invoiceId: string; amount?: number; returnUrl?: string }
 *
 * Creates a checkout session with the configured provider and persists
 * a PaymentSession row. Returns { checkoutUrl } the client can redirect
 * the payer to.
 *
 * If `amount` is omitted, the invoice's balanceDue is used. Caller may
 * pass a partial amount for split payments.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { getPaymentProvider } from "@/lib/payments";
import { logger } from "@/lib/logger";

const schema = z.object({
  invoiceId: z.string().min(1),
  amount:    z.number().positive().optional(),
  returnUrl: z.string().url().optional(),
});

function originFromRequest(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "BILLING", "RECEPTIONIST", "DOCTOR"] });
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: parsed.data.invoiceId },
      select: {
        id: true, invoiceNumber: true, balanceDue: true, total: true, status: true,
        tenantId: true,
        patient: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
    });
    if (!invoice) return NextResponse.json({ success: false, error: "invoice_not_found" }, { status: 404 });
    if (invoice.status === "PAID") {
      return NextResponse.json({ success: false, error: "invoice_already_paid" }, { status: 409 });
    }

    const amount = parsed.data.amount ?? invoice.balanceDue;
    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, error: "nothing_to_pay" }, { status: 400 });
    }

    const provider = getPaymentProvider();
    const origin = originFromRequest(request);
    const successUrl = parsed.data.returnUrl ?? `${origin}/admin/billing?paid=${invoice.id}`;
    const cancelUrl  = `${origin}/admin/billing?cancelled=${invoice.id}`;

    const checkout = await provider.createCheckout({
      invoiceId: invoice.id,
      amount,
      currency: process.env.PAYMENT_DEFAULT_CURRENCY ?? "USD",
      description: `Invoice ${invoice.invoiceNumber}`,
      successUrl,
      cancelUrl,
      customer: {
        name: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
        email: invoice.patient.email,
        phone: invoice.patient.phone,
      },
      metadata: { invoiceId: invoice.id, processedById: auth.user.id },
    });

    await prisma.paymentSession.create({
      data: {
        tenantId: invoice.tenantId ?? null,
        invoiceId: invoice.id,
        provider: provider.name,
        gatewayReference: checkout.reference,
        amount,
        currency: process.env.PAYMENT_DEFAULT_CURRENCY ?? "USD",
        checkoutUrl: checkout.checkoutUrl,
        returnUrl: successUrl,
        createdById: auth.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        provider: provider.name,
        reference: checkout.reference,
        checkoutUrl: checkout.checkoutUrl,
      },
    }, { status: 201 });
  } catch (err) {
    logger.api("POST", "/api/payments/checkout", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "internal_error" },
      { status: 500 }
    );
  }
}
