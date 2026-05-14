/**
 * @route POST /api/admin/whatsapp/disconnect
 * Logs out of the WhatsApp session and wipes the on-disk auth state.
 * Next GET /status will issue a fresh QR.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { disconnectWhatsApp } from "@/lib/whatsapp-baileys";

export async function POST() {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
  if (auth.response) return auth.response;

  try {
    await disconnectWhatsApp();
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.api("POST", "/api/admin/whatsapp/disconnect", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
