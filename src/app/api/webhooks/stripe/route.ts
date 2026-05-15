/**
 * @route POST /api/webhooks/stripe
 *
 * Receives Stripe Checkout/PaymentIntent events, verifies the signature
 * via the official Stripe SDK, and idempotently records successful
 * payments. Stripe REQUIRES the raw body for signature verification —
 * we read req.text() before any JSON parsing.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripeProvider } from "@/lib/payments";
import { bypassTenantScope } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";

// Disable Next's automatic body parsing for this route — Stripe wants raw bytes.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    logger.warn("Stripe webhook body read failed", { err: String(err) });
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }

  const signature = request.headers.get("stripe-signature");

  let outcome;
  try {
    outcome = await stripeProvider.parseWebhook({ rawBody, signature });
  } catch (err) {
    // Signature mismatch / unknown event format → 400 so Stripe retries
    // with an alert visible in the dashboard.
    logger.warn("Stripe webhook verification failed", { err: String(err) });
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  // Bypass tenant scoping: the webhook arrives outside any request
  // context but needs to read/write tenanted rows. The PaymentSession
  // row itself carries the tenant context we need.
  try {
    await bypassTenantScope(async () => {
      const session = await prisma.paymentSession.findUnique({
        where: { gatewayReference: outcome.reference },
        include: { invoice: { select: { id: true, total: true, amountPaid: true, balanceDue: true, status: true } } },
      });
      if (!session) {
        // Unknown reference — likely a test event or a stale session
        // pruned from the DB. Ack so Stripe stops retrying.
        logger.info("Stripe webhook: unknown reference, ignoring", { reference: outcome.reference });
        return;
      }
      if (session.status === "SUCCEEDED" && outcome.status === "SUCCEEDED") {
        // Already processed — idempotent ack.
        return;
      }

      // Flip session status first so a duplicate webhook bouncing
      // through immediately sees SUCCEEDED and short-circuits.
      const newStatus = outcome.status;
      await prisma.paymentSession.update({
        where: { id: session.id },
        data: { status: newStatus, completedAt: new Date() },
      });

      if (newStatus !== "SUCCEEDED") {
        logger.info("Stripe webhook: non-success outcome", { reference: outcome.reference, status: newStatus });
        return;
      }

      const amount = outcome.amount ?? session.amount;

      // Create the Payment row, then atomically refresh invoice totals.
      await prisma.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            invoiceId: session.invoiceId,
            amount,
            method: "CARD",
            status: "COMPLETED",
            reference: outcome.reference,
            processedById: session.createdById ?? "system",
            processedByName: "Online (Stripe)",
            gatewayProvider: "stripe",
            gatewayReference: outcome.reference,
            gatewayFeeCents: outcome.feeCents ?? null,
          },
        });

        // Sum existing payments to avoid race-condition under-counting.
        const totals = await tx.payment.aggregate({
          where: { invoiceId: session.invoiceId, status: "COMPLETED" },
          _sum: { amount: true },
        });
        const paid = Number(totals._sum.amount ?? 0);
        const balanceDue = Math.max(0, session.invoice.total - paid);
        const newInvoiceStatus = balanceDue <= 0 ? "PAID" : paid > 0 ? "PARTIAL" : session.invoice.status;

        await tx.invoice.update({
          where: { id: session.invoiceId },
          data: {
            amountPaid: paid,
            balanceDue,
            status: newInvoiceStatus,
          },
        });
      });

      logger.info("Stripe webhook: payment recorded", { invoiceId: session.invoiceId, amount });
    });
  } catch (err) {
    logger.error("Stripe webhook processing failed", err);
    // Return 500 so Stripe retries. The handler above is idempotent.
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
