/**
 * @route POST /api/billing/invoices/[id]/whatsapp
 * Body: { includePortalLink?: boolean; to?: string }
 *
 * Sends the invoice to the patient over WhatsApp (falling back to SMS/console
 * per the messaging service). Includes a patient-portal magic link so the
 * patient can view and pay. Logged to CommunicationLog as type=WHATSAPP.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { sendMessage } from "@/lib/messaging";
import { createPortalLink, portalOrigin } from "@/lib/portal-link";
import { logger } from "@/lib/logger";

const schema = z.object({
  includePortalLink: z.boolean().optional().default(true),
  to: z.string().optional(),
});

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-PK", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "BILLING", "RECEPTIONIST", "DOCTOR"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "validation_failed", fields: parsed.error.flatten() }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true, invoiceNumber: true, total: true, balanceDue: true, status: true,
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });
    if (!invoice) return NextResponse.json({ success: false, error: "invoice_not_found" }, { status: 404 });

    const to = parsed.data.to ?? invoice.patient.phone ?? null;
    if (!to) {
      return NextResponse.json({ success: false, error: "no_phone_on_file" }, { status: 400 });
    }

    let portalLink: string | null = null;
    if (parsed.data.includePortalLink) {
      try {
        portalLink = await createPortalLink({
          patientId: invoice.patient.id,
          createdById: auth.user.id,
          origin: portalOrigin(request),
        });
      } catch (err) {
        // A missing portal link shouldn't block the message.
        logger.warn("invoice-whatsapp: portal link generation failed; sending without it", { err: String(err) });
      }
    }

    const currency = process.env.PAYMENT_DEFAULT_CURRENCY ?? "PKR";
    const name = invoice.patient.firstName || "there";
    const amount = fmtMoney(invoice.balanceDue > 0 ? invoice.balanceDue : invoice.total, currency);
    const paidUp = invoice.status === "PAID" || invoice.balanceDue <= 0;

    const message = paidUp
      ? `Hi ${name}, thank you — your invoice ${invoice.invoiceNumber} at DentaCore Dental Clinic is paid in full.` +
        (portalLink ? `\n\nView your records: ${portalLink}` : "")
      : `Hi ${name}, your invoice ${invoice.invoiceNumber} at DentaCore Dental Clinic is ready. Amount due: ${amount}.` +
        (portalLink ? `\n\nView & pay: ${portalLink}` : "");

    const result = await sendMessage({ to, message, type: "whatsapp" });

    await prisma.communicationLog.create({
      data: {
        patientId: invoice.patient.id,
        type: result.channel === "sms" ? "SMS" : "WHATSAPP",
        direction: "OUTBOUND",
        subject: `Invoice ${invoice.invoiceNumber}`,
        content: message,
        sentById: auth.user.id,
        sentByName: auth.user.name ?? null,
      },
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: "send_failed", data: { channel: result.channel } }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      data: { sentTo: to, portalLink, channel: result.channel },
    });
  } catch (err) {
    logger.api("POST", `/api/billing/invoices/${id}/whatsapp`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
