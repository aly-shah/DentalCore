import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

// Wrap with Sentry. The plugin auto-injects the error handler, source-map
// upload (if SENTRY_AUTH_TOKEN is set in CI), and the React Server Components
// instrumentation. When SENTRY_DSN is not set, init() short-circuits and the
// wrapping is a no-op.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: false,
  reactComponentAnnotation: { enabled: false },
});
