/**
 * @system DentaCore ERP — AI Tooth-wise Findings
 * @route POST /api/ai/tooth-findings — analyze a chart, return per-tooth findings
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { analyzeToothChart, type ToothInput } from "@/lib/ai/tooth-findings";

const toothSchema = z.object({
  fdi: z.number().int().min(11).max(85),
  status: z.string().max(40).nullable().optional(),
  conditions: z.string().max(2000).nullable().optional(),
  plannedTreatment: z.string().max(2000).nullable().optional(),
  completedTreatment: z.string().max(2000).nullable().optional(),
  surfaces: z.record(z.unknown()).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  priority: z.string().max(20).nullable().optional(),
});

const bodySchema = z.object({
  patientId: z.string(),
  // Optional: caller can send teeth explicitly (faster, no extra DB hit).
  // If omitted, we'll load the patient's active chart.
  teeth: z.array(toothSchema).max(40).optional(),
});

export async function POST(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR"] });
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

    let teeth: ToothInput[] = parsed.data.teeth ?? [];
    if (teeth.length === 0) {
      const records = await prisma.toothRecord.findMany({
        where: { patientId: parsed.data.patientId },
        orderBy: { fdi: "asc" },
      });
      teeth = records.map((r) => ({
        fdi: r.fdi,
        status: r.status,
        conditions: r.conditions,
        plannedTreatment: r.plannedTreatment,
        completedTreatment: r.completedTreatment,
        surfaces: (r.surfaces as Record<string, unknown> | null) ?? null,
        notes: r.notes,
        priority: r.priority,
      }));
    }

    // Patient context (age, allergies, history) — optional but useful
    const patient = await prisma.patient.findUnique({
      where: { id: parsed.data.patientId },
      include: { allergies: true },
    });
    const patientAge = patient?.dateOfBirth
      ? Math.floor((Date.now() - patient.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : undefined;
    const allergies = patient?.allergies?.map((a) => a.allergen) ?? [];

    const result = await analyzeToothChart(
      { teeth, patientAge, allergies },
      { patientId: parsed.data.patientId, doctorId: auth.user.id }
    );

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    logger.api("POST", "/api/ai/tooth-findings", err);
    return NextResponse.json(
      { success: false, error: "AI service error" },
      { status: 500 }
    );
  }
}
