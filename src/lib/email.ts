/**
 * Email transport via SMTP (nodemailer).
 *
 * Configure with the standard env vars:
 *   SMTP_HOST       - e.g. smtp.gmail.com / smtp.zoho.com / mail.yourdomain
 *   SMTP_PORT       - 465 (SSL) or 587 (STARTTLS), default 587
 *   SMTP_USER       - SMTP username
 *   SMTP_PASS       - SMTP password / app-password
 *   SMTP_FROM       - "DentaCore <hello@yourclinic.com>"
 *   SMTP_SECURE     - "1" to force TLS-from-the-start (use with port 465)
 *
 * If SMTP_HOST is unset, sendEmail() is a no-op that logs the payload
 * — same shape as the rest of the messaging stack so non-prod runs
 * don't blow up on missing creds.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "@/lib/logger";

let _transport: Transporter | null = null;
let _transportTriedAt = 0;

function getTransport(): Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  // Cache the transport but allow re-creation if it fails. The
  // _transportTriedAt guard prevents reconnect storms.
  if (_transport) return _transport;
  if (Date.now() - _transportTriedAt < 5000) return null;
  _transportTriedAt = Date.now();

  try {
    _transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? "587", 10),
      secure: process.env.SMTP_SECURE === "1" || process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    return _transport;
  } catch (err) {
    logger.error("SMTP transport creation failed", err);
    return null;
  }
}

export interface EmailAttachment {
  filename: string;
  /** Path on disk (e.g. /tmp/invoice.pdf) OR Buffer with raw bytes. */
  path?: string;
  content?: Buffer | string;
  contentType?: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  channel: "email" | "none";
}

/**
 * Send an email. Best-effort: on transport failure returns
 * `{ success: false, ... }` rather than throwing, mirroring sendMessage().
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const transport = getTransport();
  if (!transport) {
    logger.info("[Email] No SMTP transport configured; would send", {
      to: payload.to, subject: payload.subject,
    });
    return { success: true, channel: "none", messageId: `log-${Date.now()}` };
  }
  if (!payload.html && !payload.text) {
    return { success: false, channel: "email", error: "Either html or text is required" };
  }
  try {
    const info = await transport.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text ?? stripHtml(payload.html ?? ""),
      cc: payload.cc,
      bcc: payload.bcc,
      replyTo: payload.replyTo,
      attachments: payload.attachments,
    });
    return { success: true, channel: "email", messageId: info.messageId };
  } catch (err) {
    logger.error("[Email] send failed", err);
    return { success: false, channel: "email", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Quick-and-dirty plain-text fallback when only HTML is provided. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>(\s*)/gi, "\n$1")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Templates ──────────────────────────────────────────────────────────────

/** Branded shell — pass body HTML, get a styled email back. */
export function brandedEmail(opts: {
  preheader?: string;
  body: string;
  clinicName?: string;
  brandColor?: string;
}): string {
  const clinic = opts.clinicName ?? "DentaCore Dental Clinic";
  const brand  = opts.brandColor ?? "#2563eb";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(clinic)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1917">
${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(opts.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f4">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">
      <tr><td style="background:${brand};padding:16px 24px">
        <span style="color:#ffffff;font-size:16px;font-weight:700">${escapeHtml(clinic)}</span>
      </td></tr>
      <tr><td style="padding:24px;line-height:1.55;font-size:14px;color:#1c1917">${opts.body}</td></tr>
      <tr><td style="padding:14px 24px;border-top:1px solid #e7e5e4;font-size:11px;color:#a8a29e;text-align:center">
        This message was sent by ${escapeHtml(clinic)} via DentaCore.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
