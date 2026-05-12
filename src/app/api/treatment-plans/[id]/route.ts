/**
 * @route GET / PUT  /api/treatment-plans/[id]
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

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
    const data = parsed.data;
    const plan = await prisma.treatmentPlan.update({
      where: { id },
      data: {
        ...data,
        ...(data.status === "PROPOSED" ? { proposedAt: new Date() } : {}),
        ...(data.status === "COMPLETED" ? { completedAt: new Date() } : {}),
      },
    });
    return NextResponse.json({ success: true, data: plan });
  } catch (err) {
    logger.api("PUT", `/api/treatment-plans/${id}`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
