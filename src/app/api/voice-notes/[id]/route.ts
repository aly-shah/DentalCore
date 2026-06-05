/**
 * @system DentaCore ERP — Voice Note
 * @route DELETE /api/voice-notes/:id — drop a pending voice note
 * @route PATCH  /api/voice-notes/:id — mark handled (clears it off the dashboard)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "ASSISTANT"] });
    if (auth.response) return auth.response;
    const { id } = await params;
    await prisma.voiceNote.update({ where: { id }, data: { actioned: true } }).catch(() => null);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("PATCH", "/api/voice-notes/[id]", error);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

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
