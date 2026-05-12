/**
 * Sentry — edge runtime (middleware).
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.05,
  enabled: process.env.NODE_ENV === "production" || process.env.SENTRY_FORCE_ENABLE === "1",
  environment: process.env.NODE_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_APP_VERSION ?? undefined,
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
  beforeSendTransaction(event) {
    return scrubSentryEvent(event);
  },
});
