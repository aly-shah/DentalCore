/**
 * DentaCore ERP — Messaging Service
 * Sends WhatsApp and SMS messages via configured gateway.
 * Supports: WhatsApp Business API, Baileys (QR-code session),
 * Twilio, or a custom SMS gateway.
 *
 * Priority: Business API → Baileys (QR) → SMS → console-log fallback.
 */
import { isWhatsAppReady, sendBaileysMessage } from "./whatsapp-baileys";
import { sendEmail, brandedEmail } from "./email";

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const SMS_API_URL = process.env.SMS_API_URL;
const SMS_API_KEY = process.env.SMS_API_KEY;
const BAILEYS_ENABLED = process.env.WHATSAPP_BAILEYS_ENABLED === "1" || process.env.WHATSAPP_BAILEYS_ENABLED === "true";

export interface MessagePayload {
  /** Phone number with country code for whatsapp/sms, or email address for "email". */
  to: string;
  /** Message text. Used as the email body (wrapped in brandedEmail) when channel=email. */
  message: string;
  type?: "whatsapp" | "sms" | "email";
  /** Subject line — required for email, ignored otherwise. */
  subject?: string;
  template?: string;
  params?: Record<string, string>;
  /** Optional media attachment — fully-qualified URL the gateway can fetch. */
  mediaUrl?: string;
  /** MIME type for the media. "image/*" → image bubble, "application/pdf" → doc bubble. */
  mediaMimeType?: string;
}

export interface MessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  channel: "whatsapp" | "sms" | "email" | "none";
}

/**
 * Send a message via the best available channel.
 * Priority: WhatsApp Business API → Baileys (QR) → SMS → console-log
 *
 * If the caller explicitly asks for `type: "sms"` we honour that and
 * skip the WhatsApp paths.
 */
export async function sendMessage(payload: MessagePayload): Promise<MessageResult> {
  // Email is a distinct channel — short-circuit before the
  // WhatsApp/SMS priority chain.
  if (payload.type === "email") {
    return sendEmailChannel(payload);
  }

  const wantSms = payload.type === "sms";

  // 1. WhatsApp Business API (preferred when configured — sanctioned + scalable)
  if (!wantSms && WHATSAPP_API_URL && WHATSAPP_API_TOKEN) {
    return sendWhatsApp(payload);
  }

  // 2. Baileys QR-paired WhatsApp (only when explicitly enabled AND connected)
  if (!wantSms && BAILEYS_ENABLED && isWhatsAppReady()) {
    try {
      const media =
        payload.mediaUrl && payload.mediaMimeType
          ? { url: payload.mediaUrl, mimeType: payload.mediaMimeType }
          : undefined;
      const messageId = await sendBaileysMessage(payload.to, payload.message, media);
      return { success: true, channel: "whatsapp", messageId };
    } catch (err) {
      // Fall through to SMS / log if Baileys fails on this message.
      console.warn("[Baileys] send failed, falling through:", err);
    }
  }

  // 3. SMS gateway
  if (SMS_API_URL && SMS_API_KEY) {
    return sendSMS(payload);
  }

  // 4. No gateway — log so non-prod environments aren't silently dropping messages
  console.log(`[Messaging] No gateway configured. Would send to ${payload.to}: ${payload.message}`);
  return { success: true, channel: "none", messageId: `log-${Date.now()}` };
}

async function sendWhatsApp(payload: MessagePayload): Promise<MessageResult> {
  try {
    // Build the message body. Meta's WhatsApp Cloud API uses a
    // per-type envelope: { type: "image", image: { link, caption } },
    // { type: "document", document: { link, caption, filename } }, etc.
    // Caption-style media reuses payload.message; plain text uses
    // { type: "text", text: { body } }.
    const to = payload.to.replace(/[^0-9]/g, "");
    let body: Record<string, unknown>;
    if (payload.mediaUrl && payload.mediaMimeType) {
      const mime = payload.mediaMimeType;
      const caption = payload.message?.trim() || undefined;
      if (mime.startsWith("image/")) {
        body = { messaging_product: "whatsapp", to, type: "image", image: { link: payload.mediaUrl, caption } };
      } else if (mime.startsWith("video/")) {
        body = { messaging_product: "whatsapp", to, type: "video", video: { link: payload.mediaUrl, caption } };
      } else if (mime.startsWith("audio/")) {
        body = { messaging_product: "whatsapp", to, type: "audio", audio: { link: payload.mediaUrl } };
      } else {
        const filename = payload.mediaUrl.split("/").pop() ?? "document";
        body = { messaging_product: "whatsapp", to, type: "document", document: { link: payload.mediaUrl, filename, caption } };
      }
    } else {
      body = { messaging_product: "whatsapp", to, type: "text", text: { body: payload.message } };
    }
    const res = await fetch(WHATSAPP_API_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, channel: "whatsapp", messageId: data.messages?.[0]?.id };
    }

    const err = await res.text();
    console.error("[WhatsApp] Error:", err);
    return { success: false, channel: "whatsapp", error: err };
  } catch (error) {
    console.error("[WhatsApp] Failed:", error);
    return { success: false, channel: "whatsapp", error: String(error) };
  }
}

async function sendSMS(payload: MessagePayload): Promise<MessageResult> {
  try {
    const res = await fetch(SMS_API_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SMS_API_KEY}`,
      },
      body: JSON.stringify({
        to: payload.to.replace(/[^0-9]/g, ""),
        message: payload.message,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, channel: "sms", messageId: data.id || data.messageId };
    }

    const err = await res.text();
    console.error("[SMS] Error:", err);
    return { success: false, channel: "sms", error: err };
  } catch (error) {
    console.error("[SMS] Failed:", error);
    return { success: false, channel: "sms", error: String(error) };
  }
}

async function sendEmailChannel(payload: MessagePayload): Promise<MessageResult> {
  if (!payload.to.includes("@")) {
    return { success: false, channel: "email", error: "Email recipient must be an email address" };
  }
  // Convert newlines in plain message text to <br> so the wrapped HTML
  // preserves line breaks. Plain-text fallback is generated by sendEmail.
  const bodyHtml = payload.message
    .split("\n\n")
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return sendEmail({
    to: payload.to,
    subject: payload.subject ?? "Message from DentaCore",
    html: brandedEmail({ body: bodyHtml }),
    text: payload.message,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---- Message Templates ----

export function appointmentReminder(patientName: string, date: string, time: string, doctorName: string): string {
  return `Hi ${patientName}, this is a reminder for your appointment on ${date} at ${time} with ${doctorName} at DentaCore Dental Clinic. Please arrive 10 minutes early. Reply CONFIRM to confirm.`;
}

export function prescriptionMessage(patientName: string, medicines: string[]): string {
  return `Hi ${patientName}, your prescription from DentaCore Dental Clinic:\n\n${medicines.join("\n")}\n\nPlease take as directed. Contact us for any questions.`;
}

export function followUpReminder(patientName: string, date: string, reason: string): string {
  return `Hi ${patientName}, you have a follow-up due on ${date} for: ${reason}. Please book your appointment at DentaCore Dental Clinic.`;
}

export function invoiceReminder(patientName: string, amount: string, invoiceNumber: string): string {
  return `Hi ${patientName}, you have an outstanding balance of ${amount} (${invoiceNumber}) at DentaCore Dental Clinic. Please visit us or contact for payment options.`;
}
