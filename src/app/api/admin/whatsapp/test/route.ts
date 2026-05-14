/**
 * @route POST /api/admin/whatsapp/test
 * Send a test message to a phone number to verify the live session.
 * Body: { to: "+15551234567", message?: "..." }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { sendBaileysMessage, isWhatsAppReady } from "@/lib/whatsapp-baileys";

const schema = z.object({
  to: z.string().min(5).max(20),
  message: z.string().min(1).max(500).optional(),
});

export async function POST(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
  if (auth.response) return auth.response;

  try {
    if (!isWhatsAppReady()) {
      return NextResponse.json(
        { success: false, error: "WhatsApp not connected" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const text = parsed.data.message ?? "Test message from DentaCore. WhatsApp pairing works ✓";
    const messageId = await sendBaileysMessage(parsed.data.to, text);
    return NextResponse.json({ success: true, data: { messageId } });
  } catch (err) {
    logger.api("POST", "/api/admin/whatsapp/test", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "send_failed" },
      { status: 500 }
    );
  }
}
