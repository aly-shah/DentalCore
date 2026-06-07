/**
 * @system DentaCore ERP — Voice-note dashboard feed
 * @route GET /api/voice-notes/action-items?doctorId=<id>
 *
 * Two kinds of items the dashboard surfaces, both filtered to notes the
 * user hasn't dismissed (actioned=false):
 *   - kind "pending": recordings still awaiting transcription (status
 *     PENDING) — so the front desk/doctor knows a note is waiting.
 *   - kind "action": transcribed notes (status SAVED) with an AI-extracted
 *     follow-up or other action item still to schedule.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const doctorId = new URL(request.url).searchParams.get("doctorId");

    const notes = await prisma.voiceNote.findMany({
      where: { actioned: false, ...(doctorId ? { doctorId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const pending = notes.filter((n) => n.status === "PENDING");
    const actionable = notes.filter(
      (n) => n.status === "SAVED" && (n.followUpRequired || (n.actionItems && n.actionItems !== "[]")),
    );

    const patientIds = [...new Set([...pending, ...actionable].map((n) => n.patientId))];
    const patients = patientIds.length
      ? await prisma.patient.findMany({
          where: { id: { in: patientIds } },
          select: { id: true, firstName: true, lastName: true, patientCode: true },
        })
      : [];
    const pmap = new Map(patients.map((p) => [p.id, p]));

    const safeParse = (s: string | null) => { try { return s ? JSON.parse(s) : []; } catch { return []; } };

    const pendingData = pending.map((n) => ({
      id: n.id,
      kind: "pending" as const,
      patientId: n.patientId,
      patient: pmap.get(n.patientId) ?? null,
      doctorId: n.doctorId,
      audioUrl: n.audioUrl,
      durationSec: n.durationSec,
      createdAt: n.createdAt,
    }));

    const actionData = actionable.map((n) => ({
      id: n.id,
      kind: "action" as const,
      patientId: n.patientId,
      patient: pmap.get(n.patientId) ?? null,
      followUpRequired: n.followUpRequired,
      followUpDate: n.followUpDate,
      followUpReason: n.followUpReason,
      actionItems: safeParse(n.actionItems) as { item: string; priority?: string }[],
      summary: (safeParse(n.structuredNote) as { summary?: string }).summary ?? null,
      createdAt: n.createdAt,
    }));

    // Pending (awaiting transcription) first, then transcribed action items.
    return NextResponse.json({ success: true, data: [...pendingData, ...actionData] });
  } catch (error) {
    logger.api("GET", "/api/voice-notes/action-items", error);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
