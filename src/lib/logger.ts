type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  module?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Forward error-level entries to Sentry. Lazy-required so this file works
 * in environments where @sentry/nextjs isn't installed (tests, local
 * scripts). When SENTRY_DSN is unset, Sentry.captureException is a no-op.
 */
function sendToSentry(message: string, error?: unknown, context?: Record<string, unknown>): void {
  if (typeof process === "undefined" || process.env.SENTRY_DSN === undefined) return;
  try {
    // Use dynamic require so tsx + vitest don't fail when Sentry isn't loaded.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs") as typeof import("@sentry/nextjs");
    if (error instanceof Error) {
      Sentry.captureException(error, { extra: { message, ...(context ?? {}) } });
    } else {
      Sentry.captureMessage(message, { level: "error", extra: { error, ...(context ?? {}) } });
    }
  } catch {
    // Sentry not available — ignore.
  }
}

function sanitize(data: unknown): unknown {
  if (data instanceof Error) {
    return { name: data.name, message: data.message, stack: data.stack?.split("\n").slice(0, 3).join("\n") };
  }
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (["password", "passwordHash", "token", "secret", "authorization"].includes(k.toLowerCase())) {
        clean[k] = "[REDACTED]";
      } else {
        clean[k] = v;
      }
    }
    return clean;
  }
  return data;
}

function emit(entry: LogEntry) {
  const line = JSON.stringify(entry);
  switch (entry.level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

export const logger = {
  info(message: string, data?: Record<string, unknown>) {
    emit({ level: "info", message, data: data ? sanitize(data) as Record<string, unknown> : undefined, timestamp: new Date().toISOString() });
  },
  warn(message: string, data?: Record<string, unknown>) {
    emit({ level: "warn", message, data: data ? sanitize(data) as Record<string, unknown> : undefined, timestamp: new Date().toISOString() });
  },
  error(message: string, error?: unknown, data?: Record<string, unknown>) {
    emit({
      level: "error",
      message,
      data: { ...(data || {}), error: sanitize(error) } as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    });
    sendToSentry(message, error, data);
  },
  api(method: string, path: string, error?: unknown) {
    const msg = `${method} ${path} failed`;
    emit({
      level: "error",
      message: msg,
      module: "api",
      data: error ? { error: sanitize(error) } as Record<string, unknown> : undefined,
      timestamp: new Date().toISOString(),
    });
    sendToSentry(msg, error, { module: "api", method, path });
  },
};
