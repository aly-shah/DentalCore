/**
 * Inbound WhatsApp message handler — invoked by the Baileys socket
 * whenever a message arrives. Responsible for:
 *
 *   1. Filtering — drop our own outgoing messages, group chats, status
 *      broadcasts, and replayed messages from history sync.
 *   2. Patient matching — normalize the sender's phone to compare
 *      against Patient.phone, allowing for "+" / spaces / dashes / etc.
 *   3. Logging — write a CommunicationLog row tagged INBOUND so the
 *      patient timeline shows the conversation.
 *   4. Notifying — when the message arrives for a patient with an
 *      assigned doctor, create a Notification (dedup'd per WhatsApp
 *      message id) so the doctor sees it on their dashboard.
 *
 * The handler is intentionally tolerant: any failure becomes a logged
 * warning so an unexpected message format can't crash the Baileys
 * socket or block subsequent messages.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface InboundMessage {
  /** WhatsApp message id (sock-assigned, stable). */
  id: string;
  /** Sender JID — e.g., "15551234567@s.whatsapp.net". */
  remoteJid: string;
  /** True if WhatsApp says this came from us (shouldn't normally
   *  reach us — Baileys filters fromMe upstream — but defensive). */
  fromMe: boolean;
  /** Plain-text body if present. Other media types are logged but
   *  not currently rendered into CommunicationLog.content. */
  text: string | null;
  /** Best-effort sender display name from the WhatsApp profile. */
  pushName: string | null;
  /** Unix ms when WhatsApp received the message. */
  timestamp: number;
}

/** Normalize a phone string to digits-only for matching. */
function normalizePhone(s: string | null | undefined): string {
  return (s ?? "").replace(/[^0-9]/g, "");
}

/**
 * Find a patient whose phone matches the inbound sender, comparing on
 * digits-only. Searches the soft-active set; ignores soft-deleted rows.
 * Prefer the most-recently-updated match if multiple share the number.
 */
async function findPatientByPhone(remoteJid: string) {
  const digits = remoteJid.replace(/@.*$/, "").replace(/[^0-9]/g, "");
  if (!digits) return null;

  // The schema doesn't have a digits-only index column, so we filter
  // in two passes: a cheap LIKE on the last 9 digits (likely the
  // national-format suffix), then exact-normalize compare in JS.
  const tail = digits.slice(-9);
  const candidates = await prisma.patient.findMany({
    where: {
      deletedAt: null,
      phone: { contains: tail },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      assignedDoctorId: true,
      tenantId: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  for (const p of candidates) {
    if (normalizePhone(p.phone) === digits) return p;
  }
  return null;
}

/**
 * Persist + notify on a single inbound message. Idempotent on the
 * WhatsApp message id: we use the id as a CommunicationLog.subject so
 * Baileys re-deliveries (which happen on reconnect) don't create
 * duplicates.
 */
export async function handleInboundMessage(msg: InboundMessage): Promise<void> {
  try {
    if (msg.fromMe) return;
    if (!msg.remoteJid.endsWith("@s.whatsapp.net")) {
      // Skip group chats (@g.us), broadcasts, status updates, etc.
      return;
    }
    if (!msg.text || !msg.text.trim()) {
      // Media-only messages are skipped for now. We could log a
      // placeholder ("[image]") in a future iteration.
      return;
    }

    const subject = `wa-inbound:${msg.id}`;
    const dup = await prisma.communicationLog.findFirst({
      where: { subject },
      select: { id: true },
    });
    if (dup) return;

    const patient = await findPatientByPhone(msg.remoteJid);

    if (!patient) {
      // Unmatched inbound — queue in UnmatchedInboundMessage so the
      // front desk can triage from /admin/whatsapp/inbox. The
      // externalId unique constraint makes this safely re-runnable
      // on Baileys re-deliveries.
      const digits = msg.remoteJid.replace(/@.*$/, "").replace(/[^0-9]/g, "");
      try {
        await prisma.unmatchedInboundMessage.create({
          data: {
            externalId: msg.id,
            channel: "WHATSAPP",
            fromPhone: digits,
            fromName: msg.pushName ?? null,
            content: msg.text,
            receivedAt: new Date(msg.timestamp),
          },
        });
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code !== "P2002") throw err; // anything other than dup → bubble
      }
      logger.info("Inbound WA queued in unmatched inbox", {
        from: digits,
        pushName: msg.pushName,
        preview: msg.text.slice(0, 80),
      });
      return;
    }

    await prisma.communicationLog.create({
      data: {
        patientId: patient.id,
        type: "WHATSAPP",
        direction: "INBOUND",
        subject,
        content: msg.text,
        sentByName: msg.pushName ?? `${patient.firstName} ${patient.lastName}`,
        // sentById intentionally null — INBOUND messages aren't authored
        // by a clinic user.
      },
    });

    // Notify the assigned doctor when there is one. dedupKey + the
    // unique constraint on (userId, dedupKey) makes the notification
    // idempotent across Baileys retries.
    if (patient.assignedDoctorId) {
      await prisma.notification.upsert({
        where: { userId_dedupKey: { userId: patient.assignedDoctorId, dedupKey: subject } },
        create: {
          userId: patient.assignedDoctorId,
          dedupKey: subject,
          title: `New WhatsApp from ${patient.firstName} ${patient.lastName}`,
          message: msg.text.length > 120 ? msg.text.slice(0, 117) + "…" : msg.text,
          type: "COMMUNICATION",
          link: `/patients/${patient.id}?tab=communications`,
          tenantId: patient.tenantId ?? null,
        },
        update: {},
      });
    }

    logger.info("Inbound WA logged", {
      patientId: patient.id,
      messageId: msg.id,
      preview: msg.text.slice(0, 80),
    });
  } catch (err) {
    logger.warn("Inbound WA handler failed", { err: String(err), msgId: msg.id });
  }
}
