/**
 * @route POST /api/treatment-plans/[id]/accept
 * Flip status DRAFT/PROPOSED → ACCEPTED. Records acceptedById + acceptedAt.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  patientSignatureUrl: z.string().url().max(2048).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "BILLING", "RECEPTIONIST"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "validation_failed" }, { status: 400 });
    }
    const existing = await prisma.treatmentPlan.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    if (existing.status === "ACCEPTED" || existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      return NextResponse.json(
        { success: false, error: `cannot_accept: current status is ${existing.status}` },
        { status: 409 }
      );
    }
    const plan = await prisma.treatmentPlan.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        acceptedById: auth.user.id,
        acceptedAt: new Date(),
        ...(parsed.data.patientSignatureUrl ? { patientSignatureUrl: parsed.data.patientSignatureUrl, consentSigned: true } : {}),
      },
    });
    return NextResponse.json({ success: true, data: plan });
  } catch (err) {
    logger.api("POST", `/api/treatment-plans/${id}/accept`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
