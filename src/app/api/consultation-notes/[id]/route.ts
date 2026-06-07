/**
 * @system DentaCore ERP — Consultation Note item API
 * @route DELETE /api/consultation-notes/:id — delete a consultation note
 *
 * Signed notes are locked (see the sign route) and cannot be deleted — they
 * are part of the medico-legal record. Draft (unsigned) notes can be removed.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;

    const note = await prisma.consultationNote.findUnique({ where: { id }, select: { id: true, isSigned: true } });
    if (!note) {
      return NextResponse.json({ success: false, error: "Note not found" }, { status: 404 });
    }
    if (note.isSigned) {
      return NextResponse.json({ success: false, error: "Signed notes are locked and cannot be deleted" }, { status: 400 });
    }

    await prisma.consultationNote.delete({ where: { id } });
    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    logger.api("DELETE", "/api/consultation-notes/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to delete consultation note" }, { status: 500 });
  }
}
