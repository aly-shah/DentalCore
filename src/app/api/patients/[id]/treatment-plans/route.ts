/**
 * @route GET  /api/patients/[id]/treatment-plans — list patient's plans
 * @route POST /api/patients/[id]/treatment-plans — create with phases/items
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
  surface: z.enum(["MESIAL", "DISTAL", "OCCLUSAL", "BUCCAL", "LINGUAL"]).optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().nonnegative(),
  insuranceCoverage: z.number().nonnegative().default(0),
  notes: z.string().max(1000).optional(),
});

const phaseSchema = z.object({
  order: z.number().int().min(1),
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  estimatedWeeks: z.number().int().min(0).optional(),
  items: z.array(itemSchema).optional(),
});

const createSchema = z.object({
  title: z.string().max(200).optional(),
  diagnosis: z.string().max(2000).optional(),
  rationale: z.string().max(2000).optional(),
  priority: z.enum(["EMERGENCY", "HIGH", "MEDIUM", "COSMETIC"]).default("MEDIUM"),
  consentRequired: z.boolean().default(false),
  status: z.enum(["DRAFT", "PROPOSED"]).default("PROPOSED"),
  notes: z.string().max(2000).optional(),
  phases: z.array(phaseSchema).optional(),
  items: z.array(itemSchema).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;
  const { id: patientId } = await params;

  try {
    const plans = await prisma.treatmentPlan.findMany({
      where: { patientId },
      include: {
        phases: { include: { items: true }, orderBy: { order: "asc" } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: plans });
  } catch (err) {
    logger.api("GET", `/api/patients/${patientId}/treatment-plans`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR"] });
  if (auth.response) return auth.response;
  const { id: patientId } = await params;

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;

    // Compute totals from items (and phase items)
    function itemTotals(items: z.infer<typeof itemSchema>[]): { total: number; coverage: number } {
      return items.reduce(
        (acc, it) => {
          const lineTotal = it.unitPrice * it.quantity;
          return {
            total: acc.total + lineTotal,
            coverage: acc.coverage + (it.insuranceCoverage ?? 0),
          };
        },
        { total: 0, coverage: 0 }
      );
    }

    const directItems = data.items ?? [];
    const phaseItems = (data.phases ?? []).flatMap((p) => p.items ?? []);
    const allItems = [...directItems, ...phaseItems];
    const { total, coverage } = itemTotals(allItems);

    const plan = await prisma.treatmentPlan.create({
      data: {
        patientId,
        proposedById: auth.user.id,
        status: data.status,
        title: data.title ?? null,
        diagnosis: data.diagnosis ?? null,
        rationale: data.rationale ?? null,
        priority: data.priority,
        consentRequired: data.consentRequired,
        proposedAt: data.status === "PROPOSED" ? new Date() : null,
        notes: data.notes ?? null,
        totalCost: total,
        estimatedInsuranceCoverage: coverage,
        estimatedPatientPortion: Math.max(0, total - coverage),
        items: directItems.length
          ? {
              create: directItems.map((it) => ({
                treatmentId: it.treatmentId ?? null,
                cdtCode: it.cdtCode ?? null,
                fdi: it.fdi ?? null,
                surface: it.surface ?? null,
                description: it.description,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                total: it.unitPrice * it.quantity,
                insuranceCoverage: it.insuranceCoverage ?? 0,
                patientPortion: Math.max(0, it.unitPrice * it.quantity - (it.insuranceCoverage ?? 0)),
                notes: it.notes ?? null,
              })),
            }
          : undefined,
        phases: data.phases?.length
          ? {
              create: data.phases.map((ph) => ({
                order: ph.order,
                title: ph.title,
                description: ph.description ?? null,
                estimatedWeeks: ph.estimatedWeeks ?? null,
                items: ph.items?.length
                  ? {
                      create: ph.items.map((it) => ({
                        treatmentId: it.treatmentId ?? null,
                        cdtCode: it.cdtCode ?? null,
                        fdi: it.fdi ?? null,
                        surface: it.surface ?? null,
                        description: it.description,
                        quantity: it.quantity,
                        unitPrice: it.unitPrice,
                        total: it.unitPrice * it.quantity,
                        insuranceCoverage: it.insuranceCoverage ?? 0,
                        patientPortion: Math.max(0, it.unitPrice * it.quantity - (it.insuranceCoverage ?? 0)),
                        notes: it.notes ?? null,
                      })),
                    }
                  : undefined,
              })),
            }
          : undefined,
      },
      include: { phases: { include: { items: true } }, items: true },
    });

    return NextResponse.json({ success: true, data: plan }, { status: 201 });
  } catch (err) {
    logger.api("POST", `/api/patients/${patientId}/treatment-plans`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
