/**
 * @route GET    /api/treatment-templates/[id] — read
 * @route PUT    /api/treatment-templates/[id] — update
 * @route DELETE /api/treatment-templates/[id] — soft-delete (isActive=false)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const updateSchema = z.object({
  code: z.string().min(2).max(80).optional(),
  name: z.string().min(1).max(200).optional(),
  category: z.string().max(80).optional(),
  cdtCode: z.string().max(20).nullable().optional(),
  defaultDiagnosis: z.string().max(2000).nullable().optional(),
  defaultChiefComplaint: z.string().max(2000).nullable().optional(),
  defaultClinicalFindings: z.string().max(2000).nullable().optional(),
  defaultProcedureNotes: z.string().max(4000).nullable().optional(),
  defaultMaterialsUsed: z.string().max(2000).nullable().optional(),
  defaultPostOpInstructions: z.string().max(4000).nullable().optional(),
  defaultFollowUpDays: z.number().int().min(0).max(365).nullable().optional(),
  defaultRxItems: z.array(
    z.object({
      medicineName: z.string().max(200),
      dosage: z.string().max(80),
      frequency: z.string().max(80),
      duration: z.string().max(80),
      instructions: z.string().max(500).optional(),
    })
  ).max(20).nullable().optional(),
  defaultPrice: z.number().nonnegative().optional(),
  defaultDuration: z.number().int().min(5).max(480).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const tpl = await prisma.treatmentTemplate.findUnique({ where: { id } });
    if (!tpl) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ success: true, data: tpl });
  } catch (err) {
    logger.api("GET", `/api/treatment-templates/${id}`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
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

    const existing = await prisma.treatmentTemplate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });

    const { defaultRxItems, ...rest } = parsed.data;
    const tpl = await prisma.treatmentTemplate.update({
      where: { id },
      data: {
        ...rest,
        ...(defaultRxItems === undefined
          ? {}
          : { defaultRxItems: defaultRxItems === null ? Prisma.JsonNull : (defaultRxItems as Prisma.InputJsonValue) }),
      },
    });
    return NextResponse.json({ success: true, data: tpl });
  } catch (err) {
    logger.api("PUT", `/api/treatment-templates/${id}`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const existing = await prisma.treatmentTemplate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });

    // Soft-delete by flipping isActive — preserves historical references.
    const tpl = await prisma.treatmentTemplate.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true, data: tpl });
  } catch (err) {
    logger.api("DELETE", `/api/treatment-templates/${id}`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
