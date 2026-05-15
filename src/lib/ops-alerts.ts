/**
 * Lightweight ops-alert helper. Posts a short message to a Slack or
 * Discord webhook when something operationally interesting happens
 * (Baileys disconnect, backup failure, etc.).
 *
 * Env:
 *   OPS_ALERTS_SLACK_WEBHOOK   — Slack incoming-webhook URL
 *   OPS_ALERTS_DISCORD_WEBHOOK — Discord webhook URL
 *
 * Both are optional. If neither is set, the alert is logged and
 * silently dropped — no point throwing in the hot path.
 */
import { logger } from "@/lib/logger";

type Severity = "info" | "warn" | "error";

const SLACK_URL   = process.env.OPS_ALERTS_SLACK_WEBHOOK;
const DISCORD_URL = process.env.OPS_ALERTS_DISCORD_WEBHOOK;

const ICON: Record<Severity, string> = {
  info:  "ℹ️",
  warn:  "⚠️",
  error: "🚨",
};

/**
 * Send an ops alert. Best-effort and non-blocking: returns immediately;
 * any webhook failure is logged but not propagated.
 *
 * @param severity log level used both for the icon and the logger call
 * @param title    short headline, e.g. "WhatsApp disconnected"
 * @param details  optional key→value bag rendered into the message body
 */
export function opsAlert(
  severity: Severity,
  title: string,
  details?: Record<string, unknown>,
): void {
  const body = renderMessage(severity, title, details);
  // Log locally so we still have evidence even when webhooks aren't set.
  logger[severity === "error" ? "error" : severity === "warn" ? "warn" : "info"](
    `[ops-alert] ${title}`,
    details ?? {},
  );

  const post = async (url: string, payload: Record<string, unknown>) => {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // Logging only — never let a webhook error escape into clinic flow.
      logger.warn("ops-alert webhook failed", { err: String(err), title });
    }
  };

  // Fire-and-forget — the caller doesn't await.
  if (SLACK_URL)   void post(SLACK_URL,   { text: body });
  if (DISCORD_URL) void post(DISCORD_URL, { content: body });
}

function renderMessage(severity: Severity, title: string, details?: Record<string, unknown>): string {
  const lines = [`${ICON[severity]} *${title}*`];
  if (details && Object.keys(details).length > 0) {
    for (const [k, v] of Object.entries(details)) {
      lines.push(`• ${k}: ${formatVal(v)}`);
    }
  }
  return lines.join("\n");
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}
