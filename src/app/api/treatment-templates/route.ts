/**
 * @route GET  /api/treatment-templates — list (filter by category, isActive)
 * @route POST /api/treatment-templates — create
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const createSchema = z.object({
  code: z.string().min(2).max(80),
  name: z.string().min(1).max(200),
  category: z.string().max(80),
  cdtCode: z.string().max(20).optional(),
  defaultDiagnosis: z.string().max(2000).optional(),
  defaultChiefComplaint: z.string().max(2000).optional(),
  defaultClinicalFindings: z.string().max(2000).optional(),
  defaultProcedureNotes: z.string().max(4000).optional(),
  defaultMaterialsUsed: z.string().max(2000).optional(),
  defaultPostOpInstructions: z.string().max(4000).optional(),
  defaultFollowUpDays: z.number().int().min(0).max(365).optional(),
  defaultRxItems: z.array(
    z.object({
      medicineName: z.string().max(200),
      dosage: z.string().max(80),
      frequency: z.string().max(80),
      duration: z.string().max(80),
      instructions: z.string().max(500).optional(),
    })
  ).max(20).optional(),
  defaultPrice: z.number().nonnegative().default(0),
  defaultDuration: z.number().int().min(5).max(480).default(30),
});

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") ?? undefined;
    const activeOnly = searchParams.get("active") !== "false";

    const templates = await prisma.treatmentTemplate.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ success: true, data: templates });
  } catch (err) {
    logger.api("GET", "/api/treatment-templates", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const tpl = await prisma.treatmentTemplate.create({
      data: {
        ...parsed.data,
        defaultRxItems: parsed.data.defaultRxItems ?? undefined,
      },
    });
    return NextResponse.json({ success: true, data: tpl }, { status: 201 });
  } catch (err) {
    logger.api("POST", "/api/treatment-templates", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
