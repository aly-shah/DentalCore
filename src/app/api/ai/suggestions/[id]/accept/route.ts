/**
 * @route POST /api/ai/suggestions/[id]/accept
 * Mark an AI suggestion as ACCEPTED. The acceptedEntityType + acceptedEntityId
 * fields record what the suggestion was turned into downstream (e.g. an
 * appended ConsultationNote.treatmentPlan, a new Procedure, etc.).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  acceptedEntityType: z.string().max(80).optional(),
  acceptedEntityId: z.string().max(80).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed" },
        { status: 400 }
      );
    }

    const existing = await prisma.aISuggestionLog.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    }
    if (existing.status !== "PROPOSED") {
      return NextResponse.json(
        { success: false, error: `cannot_accept: current status is ${existing.status}` },
        { status: 409 }
      );
    }

    const updated = await prisma.aISuggestionLog.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        acceptedById: auth.user.id,
        acceptedAt: new Date(),
        acceptedEntityType: parsed.data.acceptedEntityType ?? null,
        acceptedEntityId: parsed.data.acceptedEntityId ?? null,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    logger.api("POST", `/api/ai/suggestions/${id}/accept`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
