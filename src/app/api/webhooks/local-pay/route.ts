/**
 * @route POST /api/webhooks/local-pay
 *
 * Webhook for the local gateway (JazzCash/Easypaisa). When credentials
 * aren't set, this also handles a "simulation" body so QA can
 * dev-test the full happy path:
 *
 *   curl -X POST http://localhost:3000/api/webhooks/local-pay \
 *        -H 'Content-Type: application/json' \
 *        -d '{ "reference": "mock-jazzcash-xxx", "status": "SUCCEEDED", "amount": 100 }'
 *
 * Once a real merchant integration is wired in, the signature header
 * must be verified inside localProvider.parseWebhook.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localProvider } from "@/lib/payments";
import { bypassTenantScope } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let rawBody: string;
  try { rawBody = await request.text(); } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }
  const signature = request.headers.get("x-pay-signature");

  let outcome;
  try {
    outcome = await localProvider.parseWebhook({ rawBody, signature });
  } catch (err) {
    logger.warn("Local-pay webhook verification failed", { err: String(err) });
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    await bypassTenantScope(async () => {
      const session = await prisma.paymentSession.findUnique({
        where: { gatewayReference: outcome.reference },
        include: { invoice: { select: { id: true, total: true, status: true } } },
      });
      if (!session) {
        logger.info("Local-pay webhook: unknown reference", { reference: outcome.reference });
        return;
      }
      if (session.status === "SUCCEEDED" && outcome.status === "SUCCEEDED") return;

      await prisma.paymentSession.update({
        where: { id: session.id },
        data: { status: outcome.status, completedAt: new Date() },
      });

      if (outcome.status !== "SUCCEEDED") return;

      const amount = outcome.amount ?? session.amount;

      await prisma.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            invoiceId: session.invoiceId,
            amount,
            method: "DIGITAL_WALLET",
            status: "COMPLETED",
            reference: outcome.reference,
            processedById: session.createdById ?? "system",
            processedByName: `Online (${localProvider.name})`,
            gatewayProvider: localProvider.name,
            gatewayReference: outcome.reference,
          },
        });
        const totals = await tx.payment.aggregate({
          where: { invoiceId: session.invoiceId, status: "COMPLETED" },
          _sum: { amount: true },
        });
        const paid = Number(totals._sum.amount ?? 0);
        const balanceDue = Math.max(0, session.invoice.total - paid);
        await tx.invoice.update({
          where: { id: session.invoiceId },
          data: {
            amountPaid: paid,
            balanceDue,
            status: balanceDue <= 0 ? "PAID" : paid > 0 ? "PARTIAL" : session.invoice.status,
          },
        });
      });

      logger.info("Local-pay webhook: payment recorded", { invoiceId: session.invoiceId, amount });
    });
  } catch (err) {
    logger.error("Local-pay webhook processing failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
