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

    // Notify admins + front desk so they can transcribe / schedule a follow-up.
    // Best-effort: a notification failure must not fail the (already saved) note.
    try {
      const [patient, doctor] = await Promise.all([
        prisma.patient.findUnique({ where: { id: patientId }, select: { firstName: true, lastName: true, branchId: true } }),
        prisma.user.findUnique({ where: { id: note.doctorId }, select: { name: true } }),
      ]);
      const staff = await prisma.user.findMany({
        where: {
          isActive: true,
          role: { in: ["RECEPTIONIST", "ADMIN", "SUPER_ADMIN"] },
          ...(patient?.branchId ? { branchId: patient.branchId } : {}),
        },
        select: { id: true },
      });
      const patientName = patient ? `${patient.firstName} ${patient.lastName}` : "a patient";
      const dedupKey = `voice-note:${note.id}`;
      await Promise.all(staff.map((u) =>
        prisma.notification.upsert({
          where: { userId_dedupKey: { userId: u.id, dedupKey } },
          create: {
            userId: u.id,
            dedupKey,
            title: `New voice note — ${patientName}`,
            message: `${doctor?.name ?? "A doctor"} left a voice note awaiting transcription`,
            type: "VOICE_NOTE",
            link: `/patients/${patientId}`,
          },
          update: {},
        })
      ));
    } catch (notifyError) {
      logger.api("POST", "/api/patients/[id]/voice-notes (notify)", notifyError);
    }

    return NextResponse.json({ success: true, data: note }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/patients/[id]/voice-notes", error);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
