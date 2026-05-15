/**
 * Payment-provider interface.
 *
 * Implementations live next to this file (./stripe, ./local). Call
 * sites use `getPaymentProvider()` from ./index — they should never
 * import a concrete provider directly so we can swap gateways via env.
 */

export interface CheckoutRequest {
  /** Invoice this checkout is for. */
  invoiceId: string;
  /** Amount in MAJOR units (e.g. 12.34 USD, not 1234 cents). */
  amount: number;
  /** ISO 4217 currency (USD, EUR, PKR …). */
  currency: string;
  /** Free-text label rendered on the hosted payment page. */
  description: string;
  /** Where to send the payer when checkout succeeds / fails. */
  successUrl: string;
  cancelUrl: string;
  /** Patient (for receipts) — adapter is free to ignore. */
  customer?: { name?: string; email?: string | null; phone?: string | null };
  /** Free-form metadata propagated back through the webhook. */
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  /** Unique gateway-side identifier (session id, intent id, etc.).
   *  Used as the idempotency key for the webhook handler. */
  reference: string;
  /** Hosted payment-page URL to redirect the payer to. Adapters that
   *  don't have a hosted page can return their inline-confirm URL. */
  checkoutUrl: string;
}

export interface WebhookOutcome {
  /** Has the payment cleared (or definitively failed)? */
  status: "SUCCEEDED" | "FAILED" | "PENDING" | "EXPIRED" | "CANCELLED";
  /** Gateway reference — must match the CheckoutResult.reference so we
   *  can locate the matching PaymentSession. */
  reference: string;
  /** Amount actually captured (major units). May differ from the amount
   *  the session was created with (partial captures, refunds, etc.). */
  amount?: number;
  currency?: string;
  /** Gateway fee in minor units (cents) — null when not reported. */
  feeCents?: number | null;
  /** Free-form metadata the gateway gave back to us. */
  metadata?: Record<string, string>;
}

export interface RefundRequest {
  /** Original Payment row id (NOT the gateway reference). */
  paymentId: string;
  /** Refund amount, major units. Defaults to the full payment. */
  amount?: number;
  reason?: string;
}

export interface RefundResult {
  reference: string;
  amount: number;
  status: "REFUNDED" | "PENDING" | "FAILED";
}

export interface PaymentProvider {
  /** Short name, used as `Payment.gatewayProvider`. */
  readonly name: string;

  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;

  /**
   * Verify + parse an incoming webhook request.
   * Implementations MUST verify the signature and throw on mismatch
   * before returning. Caller passes the raw request body and headers.
   */
  parseWebhook(opts: {
    rawBody: string;
    signature: string | null;
  }): Promise<WebhookOutcome>;

  /** Optional — providers without a refund API can throw. */
  refund?(req: RefundRequest): Promise<RefundResult>;
}

export class PaymentConfigError extends Error {
  constructor(provider: string, key: string) {
    super(`Payment provider "${provider}" is not configured: missing ${key}`);
    this.name = "PaymentConfigError";
  }
}
