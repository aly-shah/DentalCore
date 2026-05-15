/**
 * Local PK gateway stub — JazzCash / Easypaisa.
 *
 * Both providers expose REST APIs for merchants to initiate a payment
 * and receive a redirect-back / IPN callback. The contract differs in
 * detail but follows the same shape, so we plug whichever is configured
 * in via env without changing call sites.
 *
 * Until credentials are wired in, createCheckout returns a "mock"
 * checkout URL that points to an internal page describing how to enable
 * the gateway — better than silently failing.
 *
 * Env (when credentials become available):
 *   PAYMENT_LOCAL_PROVIDER       - "jazzcash" | "easypaisa"
 *   PAYMENT_LOCAL_MERCHANT_ID
 *   PAYMENT_LOCAL_API_KEY
 *   PAYMENT_LOCAL_WEBHOOK_SECRET
 */
import crypto from "node:crypto";
import type {
  CheckoutRequest, CheckoutResult, PaymentProvider, WebhookOutcome,
} from "./types";

const SUB_PROVIDER = (process.env.PAYMENT_LOCAL_PROVIDER ?? "jazzcash").toLowerCase();
const MERCHANT_ID  = process.env.PAYMENT_LOCAL_MERCHANT_ID;
const API_KEY      = process.env.PAYMENT_LOCAL_API_KEY;

function isConfigured(): boolean {
  return !!MERCHANT_ID && !!API_KEY;
}

export const localProvider: PaymentProvider = {
  name: SUB_PROVIDER,

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    if (!isConfigured()) {
      // Mock so the rest of the flow (PaymentSession row, UI redirect,
      // webhook simulation) can still be exercised in dev. The reference
      // is unique-per-call so the @@unique constraint behaves correctly.
      const reference = `mock-${SUB_PROVIDER}-${crypto.randomBytes(8).toString("hex")}`;
      const url = new URL(req.successUrl);
      url.searchParams.set("simulated", "1");
      url.searchParams.set("reference", reference);
      return { reference, checkoutUrl: url.toString() };
    }

    // ── Real implementation goes here ────────────────────────────────
    // Both JazzCash and Easypaisa expect an HMAC-signed form post to a
    // hosted page. The exact field names are merchant-specific and live
    // in their integration packs. Replace this block when you have a
    // merchant account.
    throw new Error(
      `Local payment provider "${SUB_PROVIDER}" is configured but not implemented. ` +
      `Add the gateway-specific request flow in src/lib/payments/local.ts.`
    );
  },

  async parseWebhook({ rawBody, signature }): Promise<WebhookOutcome> {
    if (!isConfigured()) {
      // Dev fallback: accept an arbitrary JSON payload of the shape
      // { reference: string; status: "SUCCEEDED" | … } so QA can simulate.
      try {
        const obj = JSON.parse(rawBody);
        if (typeof obj?.reference === "string" && typeof obj?.status === "string") {
          return {
            status: obj.status as WebhookOutcome["status"],
            reference: obj.reference,
            amount: typeof obj.amount === "number" ? obj.amount : undefined,
            currency: obj.currency,
          };
        }
      } catch { /* fall through */ }
      throw new Error("Local provider not configured and webhook body is not a simulation payload");
    }
    // Real signature verification would happen here. Both providers
    // typically sign the body with a shared secret + HMAC-SHA256.
    void signature;
    throw new Error(`Webhook verification for "${SUB_PROVIDER}" is not implemented yet.`);
  },
};
