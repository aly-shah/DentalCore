/**
 * @route POST /api/ai/draft-reply
 * Body: { patientId: string }
 * Suggests one short reply to the patient's most-recent inbound
 * WhatsApp/SMS, based on the conversation history. Logged with full
 * provenance via AISuggestionLog.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { draftReply } from "@/lib/ai/draft-reply";

const bodySchema = z.object({ patientId: z.string().min(1) });

export async function POST(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST"] });
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await draftReply(parsed.data.patientId, { doctorId: auth.user.id });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    logger.api("POST", "/api/ai/draft-reply", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "AI service error" },
      { status: 500 }
    );
  }
}
