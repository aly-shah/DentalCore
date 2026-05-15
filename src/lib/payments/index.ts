/**
 * Provider selector.
 *
 *   PAYMENT_PROVIDER=stripe  → use Stripe (default when STRIPE_SECRET_KEY is set)
 *   PAYMENT_PROVIDER=local   → use the JazzCash/Easypaisa adapter
 *
 * If unset, we infer from credentials: STRIPE_SECRET_KEY wins, falling
 * back to local. This keeps the dev experience zero-config.
 */
import type { PaymentProvider } from "./types";
import { stripeProvider } from "./stripe";
import { localProvider } from "./local";

export { stripeProvider, localProvider };
export * from "./types";

function inferProvider(): "stripe" | "local" {
  const explicit = (process.env.PAYMENT_PROVIDER ?? "").toLowerCase();
  if (explicit === "stripe" || explicit === "local") return explicit;
  return process.env.STRIPE_SECRET_KEY ? "stripe" : "local";
}

export function getPaymentProvider(): PaymentProvider {
  return inferProvider() === "stripe" ? stripeProvider : localProvider;
}

export function getPaymentProviderByName(name: string | null | undefined): PaymentProvider | null {
  if (!name) return null;
  if (name === "stripe") return stripeProvider;
  if (name === localProvider.name || name === "jazzcash" || name === "easypaisa") return localProvider;
  return null;
}
