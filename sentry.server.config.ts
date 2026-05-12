/**
 * Sentry — server runtime (API routes, server components).
 *
 * Loaded by Next.js automatically when @sentry/nextjs is installed.
 * Filters PHI-bearing request data before transmission.
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust based on volume — 10% of normal traffic, 100% of errors.
  tracesSampleRate: 0.1,

  // Disable in dev unless explicitly enabled.
  enabled: process.env.NODE_ENV === "production" || process.env.SENTRY_FORCE_ENABLE === "1",

  environment: process.env.NODE_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_APP_VERSION ?? undefined,

  // Strip PHI / secrets from every event before it leaves the process.
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
  beforeSendTransaction(event) {
    return scrubSentryEvent(event);
  },
});
