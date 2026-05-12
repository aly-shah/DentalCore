/**
 * @route POST /api/treatment-plans/[id]/complete
 * Flip plan and all items to COMPLETED. Records completedAt.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const existing = await prisma.treatmentPlan.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      return NextResponse.json(
        { success: false, error: `cannot_complete: current status is ${existing.status}` },
        { status: 409 }
      );
    }

    const [plan] = await prisma.$transaction([
      prisma.treatmentPlan.update({
        where: { id },
        data: { status: "COMPLETED", completedAt: new Date() },
      }),
      prisma.treatmentPlanItem.updateMany({
        where: { OR: [{ planId: id }, { phase: { planId: id } }], status: { notIn: ["DECLINED"] } },
        data: { status: "COMPLETED" },
      }),
      prisma.treatmentPlanPhase.updateMany({
        where: { planId: id, status: { notIn: ["SKIPPED"] } },
        data: { status: "COMPLETED" },
      }),
    ]);

    return NextResponse.json({ success: true, data: plan });
  } catch (err) {
    logger.api("POST", `/api/treatment-plans/${id}/complete`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
