/**
 * @route GET / PUT  /api/treatment-plans/[id]
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const itemSchema = z.object({
  treatmentId: z.string().optional(),
  cdtCode: z.string().max(20).optional(),
  fdi: z.number().int().optional(),
  surface: z.string().max(20).optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().nonnegative(),
  insuranceCoverage: z.number().nonnegative().default(0),
  notes: z.string().max(2000).optional(),
});

const updateSchema = z.object({
  status: z.enum(["DRAFT", "PROPOSED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  title: z.string().max(200).optional(),
  diagnosis: z.string().max(2000).optional(),
  rationale: z.string().max(2000).optional(),
  priority: z.enum(["EMERGENCY", "HIGH", "MEDIUM", "COSMETIC"]).optional(),
  consentRequired: z.boolean().optional(),
  consentSigned: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  invoiceId: z.string().optional(),
  /** When provided, replaces the plan's flat (non-phased) items wholesale. */
  items: z.array(itemSchema).max(50).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const plan = await prisma.treatmentPlan.findUnique({
      where: { id },
      include: {
        phases: { include: { items: true }, orderBy: { order: "asc" } },
        items: true,
      },
    });
    if (!plan) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ success: true, data: plan });
  } catch (err) {
    logger.api("GET", `/api/treatment-plans/${id}`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "BILLING"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { items, ...scalarData } = parsed.data;

    const plan = await prisma.$transaction(async (tx) => {
      // If the caller supplied items, replace the plan's flat (non-phased)
      // items wholesale. Phased items live under TreatmentPlanPhase and
      // are NOT touched by this update — they have their own lifecycle.
      let totals: { totalCost: number; coverage: number } | null = null;
      if (items) {
        await tx.treatmentPlanItem.deleteMany({ where: { planId: id, phaseId: null } });
        if (items.length > 0) {
          await tx.treatmentPlanItem.createMany({
            data: items.map((it) => ({
              planId: id,
              treatmentId: it.treatmentId ?? null,
              cdtCode: it.cdtCode ?? null,
              fdi: it.fdi ?? null,
              surface: it.surface ?? null,
              description: it.description,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              total: it.unitPrice * it.quantity,
              insuranceCoverage: it.insuranceCoverage,
              patientPortion: Math.max(0, it.unitPrice * it.quantity - it.insuranceCoverage),
              notes: it.notes ?? null,
            })),
          });
        }

        // Recompute plan totals from all items (flat + phased).
        const allItems = await tx.treatmentPlanItem.findMany({
          where: { OR: [{ planId: id }, { phase: { planId: id } }] },
          select: { total: true, insuranceCoverage: true },
        });
        const totalCost = allItems.reduce((s, it) => s + it.total, 0);
        const coverage = allItems.reduce((s, it) => s + it.insuranceCoverage, 0);
        totals = { totalCost, coverage };
      }

      return tx.treatmentPlan.update({
        where: { id },
        data: {
          ...scalarData,
          ...(scalarData.status === "PROPOSED" ? { proposedAt: new Date() } : {}),
          ...(scalarData.status === "COMPLETED" ? { completedAt: new Date() } : {}),
          ...(totals ? {
            totalCost: totals.totalCost,
            estimatedInsuranceCoverage: totals.coverage,
            estimatedPatientPortion: Math.max(0, totals.totalCost - totals.coverage),
          } : {}),
        },
        include: { phases: { include: { items: true } }, items: true },
      });
    });
    return NextResponse.json({ success: true, data: plan });
  } catch (err) {
    logger.api("PUT", `/api/treatment-plans/${id}`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
