/**
 * @route GET /api/patients/[id]/dental-chart/history
 * Returns all charts for the patient plus tooth-event timelines.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;
  const { id: patientId } = await params;

  try {
    const [charts, events] = await Promise.all([
      prisma.dentalChart.findMany({
        where: { patientId },
        include: { teeth: { orderBy: { fdi: "asc" } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.toothEvent.findMany({
        where: { tooth: { patientId } },
        include: { tooth: { select: { fdi: true } } },
        orderBy: { occurredAt: "desc" },
        take: 200,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { charts, events },
    });
  } catch (err) {
    logger.api("GET", `/api/patients/${patientId}/dental-chart/history`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
