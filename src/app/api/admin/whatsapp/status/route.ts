/**
 * @route GET /api/admin/whatsapp/status
 * Returns the current Baileys session status + QR (as a data URL) if
 * a fresh pairing code is available. Polled by the admin pairing page.
 *
 * Calling this endpoint also lazily boots the socket — visiting
 * /admin/whatsapp is enough to trigger the first connection.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { getWhatsApp, getWhatsAppState } from "@/lib/whatsapp-baileys";

export async function GET() {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
  if (auth.response) return auth.response;

  try {
    const enabled = process.env.WHATSAPP_BAILEYS_ENABLED === "1" || process.env.WHATSAPP_BAILEYS_ENABLED === "true";
    // Only boot when explicitly enabled — avoids spawning a WS connection
    // in dev / unconfigured environments.
    if (enabled) void getWhatsApp();
    const state = getWhatsAppState();
    return NextResponse.json({ success: true, data: { enabled, ...state } });
  } catch (err) {
    logger.api("GET", "/api/admin/whatsapp/status", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
