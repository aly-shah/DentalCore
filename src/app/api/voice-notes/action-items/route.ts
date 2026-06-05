/**
 * @system DentaCore ERP — Voice-note action items (dashboard)
 * @route GET /api/voice-notes/action-items?doctorId=<id>
 *
 * Returns transcribed voice notes that still need attention — a follow-up
 * appointment (with the AI-extracted date) or other action items — and that
 * the doctor hasn't yet scheduled/dismissed. Surfaced on the dashboard.
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
      where: { status: "SAVED", actioned: false, ...(doctorId ? { doctorId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    // Only those with something to act on.
    const relevant = notes.filter((n) => n.followUpRequired || (n.actionItems && n.actionItems !== "[]"));

    const patientIds = [...new Set(relevant.map((n) => n.patientId))];
    const patients = patientIds.length
      ? await prisma.patient.findMany({
          where: { id: { in: patientIds } },
          select: { id: true, firstName: true, lastName: true, patientCode: true },
        })
      : [];
    const pmap = new Map(patients.map((p) => [p.id, p]));

    const safeParse = (s: string | null) => { try { return s ? JSON.parse(s) : []; } catch { return []; } };

    const data = relevant.map((n) => ({
      id: n.id,
      patientId: n.patientId,
      patient: pmap.get(n.patientId) ?? null,
      followUpRequired: n.followUpRequired,
      followUpDate: n.followUpDate,
      followUpReason: n.followUpReason,
      actionItems: safeParse(n.actionItems) as { item: string; priority?: string }[],
      summary: (safeParse(n.structuredNote) as { summary?: string }).summary ?? null,
      createdAt: n.createdAt,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.api("GET", "/api/voice-notes/action-items", error);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
