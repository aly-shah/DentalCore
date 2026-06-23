import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // The desktop (Electron) build sets BUILD_STANDALONE=1 so Next emits a
  // self-contained server in .next/standalone that Electron can launch
  // offline. The VPS deploy leaves this unset and builds normally.
  ...(process.env.BUILD_STANDALONE ? { output: "standalone" as const } : {}),
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
  sourcemaps: { disable: false, deleteSourcemapsAfterUpload: true },
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
    reactComponentAnnotation: { enabled: false },
  },
});
