/**
 * @system DentaCore ERP — AI Patient Summary
 * @route POST /api/ai/patient-summary — 3-5 bullet pre-visit briefing
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { summarizePatient } from "@/lib/ai/patient-summary";

const bodySchema = z.object({ patientId: z.string() });

export async function POST(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR"] });
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await summarizePatient(parsed.data.patientId, { doctorId: auth.user.id });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    logger.api("POST", "/api/ai/patient-summary", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "AI service error" },
      { status: 500 }
    );
  }
}
