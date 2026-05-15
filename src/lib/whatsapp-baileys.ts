/**
 * Baileys WhatsApp client — QR-code paired (no official Business API).
 *
 * Lifecycle:
 *  - The first call to `getWhatsApp()` lazily boots the socket using
 *    persisted auth state on disk (WHATSAPP_SESSION_DIR, default
 *    `.whatsapp-session`).
 *  - The socket is cached at module scope so it survives across API
 *    requests in the same Node process (we run PM2 fork mode, single
 *    instance — no need for an external broker).
 *  - Auto-reconnects on disconnect except when WhatsApp explicitly
 *    logs us out (in which case the local session is wiped and the
 *    admin needs to re-scan a fresh QR).
 *
 * Caveat: WhatsApp's terms of service do not officially permit
 * commercial bots over the personal/Web protocol. Use this for small
 * clinics that accept the ban risk; route through the Business API
 * for large or regulated deployments (set WHATSAPP_API_URL +
 * WHATSAPP_API_TOKEN — messaging.ts prefers the Business API).
 */
import path from "node:path";
import { existsSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import * as QRCode from "qrcode";
import { logger } from "@/lib/logger";
import { handleInboundMessage } from "./whatsapp-inbound";

// Baileys is a heavy native-ish dep — we import it dynamically inside
// the boot function so that Next.js doesn't try to bundle it for the
// Edge runtime, and tests that don't touch WhatsApp don't pay the
// import cost.
type WASocket = Awaited<ReturnType<typeof boot>>["sock"];

const SESSION_DIR =
  process.env.WHATSAPP_SESSION_DIR || path.join(process.cwd(), ".whatsapp-session");

type State =
  | { status: "disconnected"; qr: null; lastError: string | null }
  | { status: "qr"; qr: string; qrSeenAt: number; lastError: string | null }
  | { status: "connecting"; qr: null; lastError: string | null }
  | { status: "connected"; qr: null; lastError: null; userId: string; userName: string | null };

interface CachedClient {
  state: State;
  sock: WASocket | null;
  bootPromise: Promise<WASocket | null> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __whatsappBaileys: CachedClient | undefined;
}

function cache(): CachedClient {
  if (!globalThis.__whatsappBaileys) {
    globalThis.__whatsappBaileys = {
      state: { status: "disconnected", qr: null, lastError: null },
      sock: null,
      bootPromise: null,
    };
  }
  return globalThis.__whatsappBaileys;
}

async function boot() {
  const c = cache();
  c.state = { status: "connecting", qr: null, lastError: null };

  // Dynamic import keeps Baileys out of the Edge bundle.
  const baileys = await import("@whiskeysockets/baileys");
  const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

  await mkdir(SESSION_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  // fetchLatestBaileysVersion is best-effort — Baileys works against the
  // bundled default if the network call fails.
  let version: [number, number, number] | undefined;
  try {
    const v = await fetchLatestBaileysVersion();
    if (Array.isArray(v.version) && v.version.length === 3) {
      version = v.version as [number, number, number];
    }
  } catch { /* ignore — use default */ }

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    ...(version ? { version } : {}),
    // Keep logger quiet — Baileys' default is noisy.
    logger: makePinoStub() as never,
    browser: ["DentaCore", "Chrome", "1.0.0"],
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  // Inbound message handler. We only act on `type === "notify"` so the
  // history-sync replay that Baileys delivers right after reconnect
  // doesn't re-trigger notifications + log entries for old messages.
  sock.ev.on("messages.upsert", async (event) => {
    if (event.type !== "notify") return;
    for (const m of event.messages) {
      if (!m.key || !m.key.id || !m.key.remoteJid) continue;
      if (m.key.fromMe) continue;
      // Extract plain text from the various message envelopes Baileys uses.
      const text =
        m.message?.conversation
        ?? m.message?.extendedTextMessage?.text
        ?? m.message?.imageMessage?.caption
        ?? m.message?.videoMessage?.caption
        ?? m.message?.documentMessage?.caption
        ?? null;

      // If the envelope carries media, download it now and stash on
      // disk under /public/uploads so the timeline can render it.
      let mediaUrl: string | null = null;
      let mediaMimeType: string | null = null;
      const hasMedia = !!(
        m.message?.imageMessage ??
        m.message?.videoMessage ??
        m.message?.audioMessage ??
        m.message?.documentMessage
      );
      if (hasMedia) {
        try {
          const saved = await persistInboundMedia(m);
          if (saved) {
            mediaUrl = saved.url;
            mediaMimeType = saved.mimeType;
          }
        } catch (err) {
          logger.warn("inbound media persist failed", { err: String(err), id: m.key.id });
        }
      }

      try {
        await handleInboundMessage({
          id: m.key.id,
          remoteJid: m.key.remoteJid,
          fromMe: !!m.key.fromMe,
          text,
          pushName: m.pushName ?? null,
          timestamp: Number(m.messageTimestamp ?? Date.now() / 1000) * 1000,
          mediaUrl,
          mediaMimeType,
        });
      } catch (err) {
        logger.warn("inbound dispatch failed", { err: String(err), id: m.key.id });
      }
    }
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      try {
        const dataUrl = await QRCode.toDataURL(qr, { errorCorrectionLevel: "M", margin: 1, width: 320 });
        c.state = { status: "qr", qr: dataUrl, qrSeenAt: Date.now(), lastError: null };
      } catch (err) {
        logger.warn("Baileys QR encode failed", { err: String(err) });
      }
    }
    if (connection === "open") {
      const userId = sock.user?.id ?? "unknown";
      c.state = {
        status: "connected",
        qr: null,
        lastError: null,
        userId,
        userName: sock.user?.name ?? null,
      };
      logger.info("WhatsApp Baileys connected", { userId });
    }
    if (connection === "close") {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      if (loggedOut) {
        // Wipe the session so the next boot shows a fresh QR.
        try { rmSync(SESSION_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
        c.state = { status: "disconnected", qr: null, lastError: "logged_out" };
        c.sock = null;
        c.bootPromise = null;
        logger.warn("WhatsApp Baileys logged out — session cleared");
        return;
      }
      c.state = { status: "disconnected", qr: null, lastError: String(lastDisconnect?.error ?? "unknown") };
      c.sock = null;
      c.bootPromise = null;
      // Auto-reconnect after a short delay.
      setTimeout(() => { void getWhatsApp(); }, 3000);
    }
  });

  return { sock };
}

/** Returns the cached Baileys socket, booting it on first call. */
export async function getWhatsApp(): Promise<WASocket | null> {
  const c = cache();
  if (c.sock) return c.sock;
  if (!c.bootPromise) {
    c.bootPromise = boot()
      .then(({ sock }) => {
        c.sock = sock;
        return sock;
      })
      .catch((err) => {
        c.state = { status: "disconnected", qr: null, lastError: String(err) };
        c.bootPromise = null;
        c.sock = null;
        logger.error("Baileys boot failed", err);
        return null;
      });
  }
  return c.bootPromise;
}

/** Current connection state — used by /api/admin/whatsapp/status. */
export function getWhatsAppState(): State {
  return cache().state;
}

/** True when the socket is connected AND able to send. */
export function isWhatsAppReady(): boolean {
  return cache().state.status === "connected";
}

/** Force a clean disconnect + session wipe — used by the admin Disconnect button. */
export async function disconnectWhatsApp(): Promise<void> {
  const c = cache();
  try { c.sock?.logout?.(); } catch { /* ignore */ }
  c.sock = null;
  c.bootPromise = null;
  if (existsSync(SESSION_DIR)) {
    try { rmSync(SESSION_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  c.state = { status: "disconnected", qr: null, lastError: null };
}

/**
 * Send a message through the QR-paired session. Supports text and a
 * single media attachment (image / video / document / audio) — media
 * is identified by its MIME type. Text becomes the caption when both
 * are supplied. Returns the WhatsApp message id on success.
 *
 * `to` should be a phone number with country code (digits only, no +).
 */
export async function sendBaileysMessage(
  to: string,
  message: string,
  media?: { url: string; mimeType: string },
): Promise<string> {
  const sock = await getWhatsApp();
  if (!sock) throw new Error("WhatsApp not connected");
  if (!isWhatsAppReady()) throw new Error(`WhatsApp not ready (state=${getWhatsAppState().status})`);

  const digits = to.replace(/[^0-9]/g, "");
  if (!digits) throw new Error("Invalid phone number");

  const jid = `${digits}@s.whatsapp.net`;

  // Resolve relative public URLs to absolute file paths so Baileys can
  // read them from disk — Baileys' URL fetcher doesn't follow
  // app-relative paths.
  const mediaSource = media ? resolveMediaSource(media.url) : null;

  let payload: Parameters<typeof sock.sendMessage>[1];
  if (media && mediaSource) {
    const caption = message?.trim() ? message : undefined;
    const mime = media.mimeType;
    if (mime.startsWith("image/")) {
      payload = { image: mediaSource, caption, mimetype: mime };
    } else if (mime.startsWith("video/")) {
      payload = { video: mediaSource, caption, mimetype: mime };
    } else if (mime.startsWith("audio/")) {
      payload = { audio: mediaSource, mimetype: mime, ptt: mime === "audio/ogg" };
    } else {
      // PDFs, Word docs, anything else → document bubble. Filename
      // hint comes from the URL tail so WhatsApp shows a useful label.
      const fileName = media.url.split("/").pop() ?? "document";
      payload = { document: mediaSource, mimetype: mime, fileName, caption };
    }
  } else {
    payload = { text: message };
  }

  const result = await sock.sendMessage(jid, payload);
  return result?.key?.id ?? `baileys-${Date.now()}`;
}

/**
 * Convert a media reference into the shape Baileys expects:
 *  - http(s) URL → { url }
 *  - local `/uploads/...` path → { url: file:// } pointing at the
 *    served file on disk (since the WhatsApp client can't reach our
 *    private network). Baileys handles file:// URLs by reading the
 *    bytes directly.
 */
function resolveMediaSource(urlOrPath: string): { url: string } | null {
  if (/^https?:\/\//i.test(urlOrPath)) return { url: urlOrPath };
  if (urlOrPath.startsWith("/uploads/")) {
    const filePath = path.join(process.cwd(), "public", urlOrPath);
    return { url: `file://${filePath}` };
  }
  return null;
}

/**
 * Download an inbound media message via Baileys' helper. Returns the
 * decrypted bytes + mime type, or null if the message has no media or
 * the decode failed (logged).
 */
export async function downloadInboundMedia(
  rawMessage: unknown,
): Promise<{ buffer: Buffer; mimeType: string; fileName?: string } | null> {
  try {
    const baileys = await import("@whiskeysockets/baileys");
    const { downloadMediaMessage } = baileys;
    const msg = rawMessage as { message?: Record<string, { mimetype?: string; fileName?: string }> };
    const inner =
      msg.message?.imageMessage ??
      msg.message?.videoMessage ??
      msg.message?.audioMessage ??
      msg.message?.documentMessage ??
      msg.message?.stickerMessage;
    if (!inner) return null;
    const buffer = await downloadMediaMessage(
      rawMessage as Parameters<typeof downloadMediaMessage>[0],
      "buffer",
      {},
    );
    if (!buffer || !(buffer instanceof Buffer)) return null;
    return {
      buffer,
      mimeType: inner.mimetype ?? "application/octet-stream",
      fileName: inner.fileName,
    };
  } catch (err) {
    logger.warn("Baileys media download failed", { err: String(err) });
    return null;
  }
}

/**
 * Download an inbound media message and stash it under public/uploads
 * so the patient timeline can render it like any other attachment.
 * Returns the public URL + MIME type, or null on failure / no media.
 */
async function persistInboundMedia(rawMessage: unknown): Promise<{ url: string; mimeType: string } | null> {
  const downloaded = await downloadInboundMedia(rawMessage);
  if (!downloaded) return null;

  const { writeFile } = await import("node:fs/promises");
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  // Pick an extension from the MIME type, falling back to "bin" so
  // browsers will offer a download rather than misrendering.
  const extFromMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/3gpp": "3gp",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "application/pdf": "pdf",
  };
  const ext = extFromMime[downloaded.mimeType.toLowerCase()] ?? "bin";

  const filename = `wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = path.join(uploadDir, filename);
  await writeFile(filePath, downloaded.buffer);

  return { url: `/uploads/${filename}`, mimeType: downloaded.mimeType };
}

/** Minimal pino-compatible logger stub. Baileys logs heavily by default. */
function makePinoStub() {
  const noop = () => {};
  const child = () => stub;
  const stub = {
    level: "silent",
    trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop,
    child,
  };
  return stub;
}
