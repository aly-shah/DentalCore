/**
 * @route POST /api/billing/invoices/[id]/email
 * Body: { includePayLink?: boolean; ccSelf?: boolean }
 *
 * Emails the invoice to the patient (or `to` override). If `includePayLink`
 * is true, also generates an online checkout session and embeds the URL.
 *
 * Logs the send into CommunicationLog as type=EMAIL so it shows on the
 * Comms tab timeline.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { sendEmail, brandedEmail } from "@/lib/email";
import { getPaymentProvider } from "@/lib/payments";
import { logger } from "@/lib/logger";

const schema = z.object({
  includePayLink: z.boolean().optional().default(true),
  ccSelf:         z.boolean().optional().default(false),
  to:             z.string().email().optional(),
});

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function originFromRequest(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch { return ""; }
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
        id: true, invoiceNumber: true, total: true, amountPaid: true, balanceDue: true,
        status: true, dueDate: true, tenantId: true,
        patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      },
    });
    if (!invoice) return NextResponse.json({ success: false, error: "invoice_not_found" }, { status: 404 });

    const to = parsed.data.to ?? invoice.patient.email ?? null;
    if (!to) {
      return NextResponse.json({ success: false, error: "no_email_on_file" }, { status: 400 });
    }

    const currency = process.env.PAYMENT_DEFAULT_CURRENCY ?? "USD";
    let payLink: string | null = null;
    if (parsed.data.includePayLink && invoice.balanceDue > 0 && invoice.status !== "PAID") {
      try {
        const provider = getPaymentProvider();
        const origin = originFromRequest(request);
        const checkout = await provider.createCheckout({
          invoiceId: invoice.id,
          amount: invoice.balanceDue,
          currency,
          description: `Invoice ${invoice.invoiceNumber}`,
          successUrl: `${origin}/billing/thank-you`,
          cancelUrl:  `${origin}/billing/cancelled`,
          customer: {
            name: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
            email: invoice.patient.email,
            phone: invoice.patient.phone,
          },
          metadata: { invoiceId: invoice.id, source: "email" },
        });
        payLink = checkout.checkoutUrl;
        await prisma.paymentSession.create({
          data: {
            tenantId: invoice.tenantId ?? null,
            invoiceId: invoice.id,
            provider: provider.name,
            gatewayReference: checkout.reference,
            amount: invoice.balanceDue,
            currency,
            checkoutUrl: checkout.checkoutUrl,
            createdById: auth.user.id,
          },
        });
      } catch (err) {
        // Don't fail the email send if the checkout couldn't be created.
        // Log and continue with a plain receipt.
        logger.warn("invoice-email: pay-link generation failed; sending without it", { err: String(err) });
      }
    }

    const subject = invoice.status === "PAID"
      ? `Receipt: ${invoice.invoiceNumber}`
      : `Invoice ${invoice.invoiceNumber} from DentaCore`;

    const greeting = invoice.patient.firstName ? `Hi ${invoice.patient.firstName},` : "Hi,";
    const html = brandedEmail({
      preheader: subject,
      body: `
        <p>${greeting}</p>
        <p>${invoice.status === "PAID"
          ? `Thank you — payment for invoice <strong>${invoice.invoiceNumber}</strong> has been received in full.`
          : `Here are the details for invoice <strong>${invoice.invoiceNumber}</strong>.`}</p>

        <table style="width:100%;margin:14px 0;border-collapse:collapse;font-size:13px">
          <tr><td style="padding:6px 0;color:#78716c">Invoice</td><td style="padding:6px 0;text-align:right">${invoice.invoiceNumber}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Total</td><td style="padding:6px 0;text-align:right"><strong>${fmtMoney(invoice.total, currency)}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Paid to date</td><td style="padding:6px 0;text-align:right">${fmtMoney(invoice.amountPaid, currency)}</td></tr>
          <tr><td style="padding:6px 0;color:#78716c">Balance due</td><td style="padding:6px 0;text-align:right"><strong>${fmtMoney(invoice.balanceDue, currency)}</strong></td></tr>
          ${invoice.dueDate ? `<tr><td style="padding:6px 0;color:#78716c">Due by</td><td style="padding:6px 0;text-align:right">${new Date(invoice.dueDate).toLocaleDateString("en-US", { dateStyle: "medium" })}</td></tr>` : ""}
        </table>

        ${payLink
          ? `<p style="margin:18px 0"><a href="${payLink}" style="display:inline-block;padding:11px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Pay online</a></p>
             <p style="font-size:11px;color:#a8a29e">Or copy this link: ${payLink}</p>`
          : ""}

        <p style="margin-top:24px">If you have any questions about this invoice, just reply to this email and our front desk will help.</p>
      `,
    });

    const result = await sendEmail({
      to,
      subject,
      html,
      replyTo: process.env.SMTP_REPLY_TO ?? undefined,
      cc: parsed.data.ccSelf && auth.user.email ? auth.user.email : undefined,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? "email_failed" }, { status: 502 });
    }

    // Mirror onto the patient's Comms timeline
    await prisma.communicationLog.create({
      data: {
        patientId: invoice.patient.id,
        type: result.channel === "email" ? "EMAIL" : "SYSTEM",
        direction: "OUTBOUND",
        subject,
        content: `Sent invoice ${invoice.invoiceNumber} to ${to}` + (payLink ? " (with pay link)" : ""),
        sentById: auth.user.id,
        sentByName: auth.user.name ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      data: { sentTo: to, payLink, channel: result.channel },
    });
  } catch (err) {
    logger.api("POST", `/api/billing/invoices/${id}/email`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
