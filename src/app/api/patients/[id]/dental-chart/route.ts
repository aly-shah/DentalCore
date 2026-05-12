/**
 * @route GET  /api/patients/[id]/dental-chart — fetch active chart + teeth
 * @route POST /api/patients/[id]/dental-chart — create a new chart (and mark primary)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const createSchema = z.object({
  numberingSystem: z.enum(["FDI", "UNIVERSAL"]).optional(),
  dentition: z.enum(["ADULT", "MIXED", "PEDIATRIC"]).optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;
  const { id: patientId } = await params;

  try {
    let chart = await prisma.dentalChart.findFirst({
      where: { patientId, isPrimary: true },
      include: { teeth: true },
    });

    // Lazy creation: if no primary chart exists for this patient, return
    // an "empty chart" shape so the UI can render — but don't persist
    // until the doctor actually writes something (POST creates).
    if (!chart) {
      return NextResponse.json({
        success: true,
        data: {
          chart: null,
          teeth: await prisma.toothRecord.findMany({ where: { patientId, chartId: null } }),
          numberingSystem: "FDI",
          dentition: "ADULT",
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        chart: {
          id: chart.id,
          patientId: chart.patientId,
          numberingSystem: chart.numberingSystem,
          dentition: chart.dentition,
          isPrimary: chart.isPrimary,
          createdAt: chart.createdAt,
          updatedAt: chart.updatedAt,
          notes: chart.notes,
        },
        teeth: chart.teeth,
        numberingSystem: chart.numberingSystem,
        dentition: chart.dentition,
      },
    });
  } catch (err) {
    logger.api("GET", `/api/patients/${patientId}/dental-chart`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "ASSISTANT"] });
  if (auth.response) return auth.response;
  const { id: patientId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Demote existing primary chart if any
    await prisma.dentalChart.updateMany({
      where: { patientId, isPrimary: true },
      data: { isPrimary: false },
    });

    const chart = await prisma.dentalChart.create({
      data: {
        patientId,
        numberingSystem: parsed.data.numberingSystem ?? "FDI",
        dentition: parsed.data.dentition ?? "ADULT",
        notes: parsed.data.notes ?? null,
        isPrimary: true,
        createdById: auth.user.id,
      },
    });

    return NextResponse.json({ success: true, data: chart }, { status: 201 });
  } catch (err) {
    logger.api("POST", `/api/patients/${patientId}/dental-chart`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
