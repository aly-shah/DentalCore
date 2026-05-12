/**
 * @system DentaCore ERP — AI Treatment Suggestions
 * @route POST /api/ai/treatment-suggestions — propose ranked treatments for a diagnosis
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { suggestTreatments } from "@/lib/ai/treatment-suggestions";

const bodySchema = z.object({
  diagnosis: z.string().min(3).max(2000),
  toothFdi: z.number().int().optional(),
  chiefComplaint: z.string().max(2000).optional(),
  medicalHistory: z.array(z.string().max(200)).max(50).optional(),
  allergies: z.array(z.string().max(100)).max(50).optional(),
  patientAge: z.number().int().min(0).max(130).optional(),
  patientId: z.string().optional(),
  appointmentId: z.string().optional(),
});

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

    const { patientId, appointmentId, ...input } = parsed.data;

    const result = await suggestTreatments(input, {
      patientId: patientId ?? null,
      appointmentId: appointmentId ?? null,
      doctorId: auth.user.id,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    logger.api("POST", "/api/ai/treatment-suggestions", err);
    return NextResponse.json(
      { success: false, error: "AI service error" },
      { status: 500 }
    );
  }
}
