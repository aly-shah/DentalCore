/**
 * @system DentaCore ERP — Voice Note discard
 * @route DELETE /api/voice-notes/:id — drop a pending voice note
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "ASSISTANT"] });
    if (auth.response) return auth.response;
    const { id } = await params;
    await prisma.voiceNote.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("DELETE", "/api/voice-notes/[id]", error);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
