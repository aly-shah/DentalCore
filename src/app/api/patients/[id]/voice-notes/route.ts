/**
 * @system DentaCore ERP — Deferred Voice Notes
 * @route GET  /api/patients/:id/voice-notes — list a patient's voice notes
 * @route POST /api/patients/:id/voice-notes — save a recording for later transcription
 *
 * Audio is uploaded separately via /api/upload (returns a /uploads/... URL);
 * we store that URL plus metadata. Transcription happens later via
 * POST /api/voice-notes/:id/transcribe.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id: patientId } = await params;

    const notes = await prisma.voiceNote.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ success: true, data: notes });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/voice-notes", error);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id: patientId } = await params;
    const body = await request.json().catch(() => ({}));

    if (!body.audioUrl || typeof body.audioUrl !== "string") {
      return NextResponse.json({ success: false, error: "audioUrl required" }, { status: 400 });
    }

    const note = await prisma.voiceNote.create({
      data: {
        patientId,
        doctorId: body.doctorId ?? auth.user.id,
        appointmentId: body.appointmentId || null,
        audioUrl: body.audioUrl,
        durationSec: Number(body.durationSec) || 0,
        status: "PENDING",
      },
    });
    return NextResponse.json({ success: true, data: note }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/patients/[id]/voice-notes", error);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
