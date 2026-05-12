"use client";

/**
 * Catches React rendering errors at the root layout. Required by Sentry's
 * Next.js App Router setup so render-time crashes get reported.
 *
 * The body MUST include <html> + <body> because this file replaces the
 * entire document on a render error.
 */
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: "#FAFAF9",
          margin: 0,
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center", color: "#1c1917" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#57534e", marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
            We hit an unexpected error and our team has been notified.
            {error?.digest ? (
              <>
                <br />
                <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                  Reference: {error.digest}
                </span>
              </>
            ) : null}
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              background: "#0284C7",
              color: "white",
              border: "none",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
