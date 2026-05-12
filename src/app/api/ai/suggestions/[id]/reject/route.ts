/**
 * @route POST /api/ai/suggestions/[id]/reject
 * Mark an AI suggestion as REJECTED with an optional reason.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "validation_failed" }, { status: 400 });
    }

    const existing = await prisma.aISuggestionLog.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    }
    if (existing.status !== "PROPOSED") {
      return NextResponse.json(
        { success: false, error: `cannot_reject: current status is ${existing.status}` },
        { status: 409 }
      );
    }

    const updated = await prisma.aISuggestionLog.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectionReason: parsed.data.reason ?? null,
        acceptedById: auth.user.id,
        acceptedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    logger.api("POST", `/api/ai/suggestions/${id}/reject`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
