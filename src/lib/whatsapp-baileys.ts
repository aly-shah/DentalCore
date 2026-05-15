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
        ?? null;
      try {
        await handleInboundMessage({
          id: m.key.id,
          remoteJid: m.key.remoteJid,
          fromMe: !!m.key.fromMe,
          text,
          pushName: m.pushName ?? null,
          timestamp: Number(m.messageTimestamp ?? Date.now() / 1000) * 1000,
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
 * Send a text message through the QR-paired session.
 * Returns the WhatsApp message id on success, throws on failure.
 *
 * `to` should be a phone number with country code (digits only, no +).
 */
export async function sendBaileysMessage(to: string, message: string): Promise<string> {
  const sock = await getWhatsApp();
  if (!sock) throw new Error("WhatsApp not connected");
  if (!isWhatsAppReady()) throw new Error(`WhatsApp not ready (state=${getWhatsAppState().status})`);

  const digits = to.replace(/[^0-9]/g, "");
  if (!digits) throw new Error("Invalid phone number");

  const jid = `${digits}@s.whatsapp.net`;
  const result = await sock.sendMessage(jid, { text: message });
  return result?.key?.id ?? `baileys-${Date.now()}`;
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
