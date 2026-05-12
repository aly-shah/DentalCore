/**
 * @route PUT /api/dental-chart/[chartId]/teeth/[fdi]
 * Upsert a tooth record for the given chart + FDI number. Writes a
 * ToothEvent on every change so the timeline view stays accurate.
 *
 * @route DELETE /api/dental-chart/[chartId]/teeth/[fdi]
 * Reset a tooth to HEALTHY (logs DELETED event). Doesn't hard-delete —
 * we keep history.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const TOOTH_STATUSES = [
  "HEALTHY", "CARIES", "FILLING", "CROWN", "BRIDGE", "IMPLANT",
  "MISSING", "ROOT_CANAL", "EXTRACTION_NEEDED", "MOBILITY", "FRACTURE",
  "PROBLEM", "UNDER_TREATMENT", "TREATED",
] as const;

const VALID_FDI = new Set<number>([
  // Permanent
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
  // Primary
  51, 52, 53, 54, 55,
  61, 62, 63, 64, 65,
  71, 72, 73, 74, 75,
  81, 82, 83, 84, 85,
]);

const surfaceSchema = z.object({
  condition: z.string().max(120).optional(),
  treatment: z.string().max(120).optional(),
  plannedTreatment: z.string().max(120).optional(),
  completedTreatment: z.string().max(120).optional(),
  notes: z.string().max(600).optional(),
});

const bodySchema = z.object({
  status: z.enum(TOOTH_STATUSES).optional(),
  conditions: z.string().max(400).optional(),
  treatment: z.string().max(400).optional(),
  plannedTreatment: z.string().max(400).optional(),
  completedTreatment: z.string().max(400).optional(),
  priority: z.enum(["EMERGENCY", "HIGH", "MEDIUM", "COSMETIC"]).optional(),
  notes: z.string().max(2000).optional(),
  surfaces: z.object({
    mesial: surfaceSchema.optional(),
    distal: surfaceSchema.optional(),
    occlusal: surfaceSchema.optional(),
    buccal: surfaceSchema.optional(),
    lingual: surfaceSchema.optional(),
  }).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ chartId: string; fdi: string }> }
) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "ASSISTANT"] });
  if (auth.response) return auth.response;

  const { chartId, fdi: fdiStr } = await params;
  const fdi = parseInt(fdiStr, 10);
  if (!VALID_FDI.has(fdi)) {
    return NextResponse.json({ success: false, error: "invalid_fdi" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const chart = await prisma.dentalChart.findUnique({ where: { id: chartId } });
    if (!chart) {
      return NextResponse.json({ success: false, error: "chart_not_found" }, { status: 404 });
    }

    const existing = await prisma.toothRecord.findUnique({
      where: { patientId_fdi: { patientId: chart.patientId, fdi } },
    });

    const data = parsed.data;

    const upserted = existing
      ? await prisma.toothRecord.update({
          where: { id: existing.id },
          data: {
            chartId,
            ...(data.status !== undefined ? { status: data.status } : {}),
            ...(data.conditions !== undefined ? { conditions: data.conditions } : {}),
            ...(data.treatment !== undefined ? { treatment: data.treatment } : {}),
            ...(data.plannedTreatment !== undefined ? { plannedTreatment: data.plannedTreatment } : {}),
            ...(data.completedTreatment !== undefined ? { completedTreatment: data.completedTreatment } : {}),
            ...(data.priority !== undefined ? { priority: data.priority } : {}),
            ...(data.notes !== undefined ? { notes: data.notes } : {}),
            ...(data.surfaces !== undefined ? { surfaces: data.surfaces } : {}),
            updatedById: auth.user.id,
          },
        })
      : await prisma.toothRecord.create({
          data: {
            patientId: chart.patientId,
            chartId,
            fdi,
            status: data.status ?? "HEALTHY",
            conditions: data.conditions ?? null,
            treatment: data.treatment ?? null,
            plannedTreatment: data.plannedTreatment ?? null,
            completedTreatment: data.completedTreatment ?? null,
            priority: data.priority ?? "MEDIUM",
            notes: data.notes ?? null,
            surfaces: data.surfaces ?? undefined,
            updatedById: auth.user.id,
          },
        });

    // Log an event whenever something material changed
    const events: Array<{
      eventType: string;
      previousStatus?: string | null;
      newStatus?: string | null;
      surface?: string | null;
      notes?: string | null;
    }> = [];
    if (data.status && data.status !== existing?.status) {
      events.push({
        eventType: "STATUS_CHANGED",
        previousStatus: existing?.status ?? null,
        newStatus: data.status,
      });
    }
    if (data.plannedTreatment && data.plannedTreatment !== existing?.plannedTreatment) {
      events.push({ eventType: "TREATMENT_PLANNED", notes: data.plannedTreatment });
    }
    if (data.completedTreatment && data.completedTreatment !== existing?.completedTreatment) {
      events.push({ eventType: "TREATMENT_COMPLETED", notes: data.completedTreatment });
    }
    for (const ev of events) {
      await prisma.toothEvent.create({
        data: {
          toothRecordId: upserted.id,
          eventType: ev.eventType,
          previousStatus: ev.previousStatus ?? null,
          newStatus: ev.newStatus ?? null,
          surface: ev.surface ?? null,
          notes: ev.notes ?? null,
          performedById: auth.user.id,
        },
      });
    }

    return NextResponse.json({ success: true, data: upserted });
  } catch (err) {
    logger.api("PUT", `/api/dental-chart/${chartId}/teeth/${fdi}`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ chartId: string; fdi: string }> }
) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR"] });
  if (auth.response) return auth.response;
  const { chartId, fdi: fdiStr } = await params;
  const fdi = parseInt(fdiStr, 10);

  try {
    const chart = await prisma.dentalChart.findUnique({ where: { id: chartId } });
    if (!chart) {
      return NextResponse.json({ success: false, error: "chart_not_found" }, { status: 404 });
    }
    const existing = await prisma.toothRecord.findUnique({
      where: { patientId_fdi: { patientId: chart.patientId, fdi } },
    });
    if (!existing) {
      return NextResponse.json({ success: true, data: null });
    }
    const reset = await prisma.toothRecord.update({
      where: { id: existing.id },
      data: {
        status: "HEALTHY",
        conditions: null,
        treatment: null,
        plannedTreatment: null,
        completedTreatment: null,
        surfaces: undefined,
        notes: null,
        updatedById: auth.user.id,
      },
    });
    await prisma.toothEvent.create({
      data: {
        toothRecordId: existing.id,
        eventType: "STATUS_CHANGED",
        previousStatus: existing.status,
        newStatus: "HEALTHY",
        notes: "Tooth reset",
        performedById: auth.user.id,
      },
    });
    return NextResponse.json({ success: true, data: reset });
  } catch (err) {
    logger.api("DELETE", `/api/dental-chart/${chartId}/teeth/${fdi}`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
