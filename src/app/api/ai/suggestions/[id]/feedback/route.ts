/**
 * @route POST /api/ai/suggestions/[id]/feedback
 * Records clinician feedback on an AI suggestion (rating, free-text,
 * flag-as-inaccurate / harmful). Feeds the AI quality dashboard.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().max(1000).optional(),
  flagAsInaccurate: z.boolean().optional(),
  flagAsHarmful: z.boolean().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR"] });
  if (auth.response) return auth.response;
  const { id: suggestionLogId } = await params;

  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Verify the suggestion exists (so we don't pile feedback onto invalid ids)
    const exists = await prisma.aISuggestionLog.findUnique({
      where: { id: suggestionLogId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ success: false, error: "suggestion_not_found" }, { status: 404 });
    }

    const fb = await prisma.aISuggestionFeedback.create({
      data: {
        suggestionLogId,
        reviewedById: auth.user.id,
        rating: parsed.data.rating,
        feedback: parsed.data.feedback ?? null,
        flagAsInaccurate: parsed.data.flagAsInaccurate ?? false,
        flagAsHarmful: parsed.data.flagAsHarmful ?? false,
      },
    });

    return NextResponse.json({ success: true, data: fb }, { status: 201 });
  } catch (err) {
    logger.api("POST", `/api/ai/suggestions/${suggestionLogId}/feedback`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
