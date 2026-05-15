/**
 * Stripe payment adapter — hosted Checkout Sessions, webhook verified
 * with the official `stripe.webhooks.constructEvent`.
 *
 * Env:
 *   STRIPE_SECRET_KEY        - sk_live_… / sk_test_…
 *   STRIPE_WEBHOOK_SECRET    - whsec_… for /api/webhooks/stripe
 *   PAYMENT_DEFAULT_CURRENCY - fallback currency (default "usd")
 */
import Stripe from "stripe";
import type {
  CheckoutRequest, CheckoutResult, PaymentProvider, RefundRequest,
  RefundResult, WebhookOutcome,
} from "./types";
import { PaymentConfigError } from "./types";

let _stripe: Stripe | null = null;
function client(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new PaymentConfigError("stripe", "STRIPE_SECRET_KEY");
  _stripe = new Stripe(key);
  return _stripe;
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const s = client();
    const currency = (req.currency || process.env.PAYMENT_DEFAULT_CURRENCY || "usd").toLowerCase();
    const session = await s.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          // Stripe charges in MINOR units; round to avoid floating-point drift.
          unit_amount: Math.round(req.amount * 100),
          product_data: { name: req.description.slice(0, 250) },
        },
      }],
      success_url: req.successUrl,
      cancel_url:  req.cancelUrl,
      customer_email: req.customer?.email ?? undefined,
      metadata: { invoiceId: req.invoiceId, ...(req.metadata ?? {}) },
    });
    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }
    return { reference: session.id, checkoutUrl: session.url };
  },

  async parseWebhook({ rawBody, signature }): Promise<WebhookOutcome> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new PaymentConfigError("stripe", "STRIPE_WEBHOOK_SECRET");
    if (!signature) throw new Error("Missing Stripe-Signature header");

    const event = client().webhooks.constructEvent(rawBody, signature, secret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        status: session.payment_status === "paid" ? "SUCCEEDED" : "PENDING",
        reference: session.id,
        amount: typeof session.amount_total === "number" ? session.amount_total / 100 : undefined,
        currency: session.currency?.toUpperCase(),
        metadata: (session.metadata as Record<string, string> | null) ?? undefined,
      };
    }
    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      return { status: "EXPIRED", reference: session.id };
    }
    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      return { status: "FAILED", reference: session.id };
    }
    // For events we don't act on, return PENDING with the session id if
    // available so the caller's idempotency layer can early-return.
    const obj = event.data?.object as { id?: string } | undefined;
    return { status: "PENDING", reference: obj?.id ?? event.id };
  },

  async refund(req: RefundRequest): Promise<RefundResult> {
    // The caller is responsible for resolving the Payment row to a
    // gateway reference; we expect req.paymentId to actually be a
    // Stripe payment_intent id at this layer.
    const r = await client().refunds.create({
      payment_intent: req.paymentId,
      amount: req.amount ? Math.round(req.amount * 100) : undefined,
      reason: req.reason as Stripe.RefundCreateParams.Reason | undefined,
    });
    return {
      reference: r.id,
      amount: typeof r.amount === "number" ? r.amount / 100 : (req.amount ?? 0),
      status: r.status === "succeeded" ? "REFUNDED" : r.status === "pending" ? "PENDING" : "FAILED",
    };
  },
};
