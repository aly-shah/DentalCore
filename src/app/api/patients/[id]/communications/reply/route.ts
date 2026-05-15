/**
 * @route POST /api/patients/[id]/communications/reply
 * Body: { message: string; type?: "whatsapp" | "sms" }
 *
 * Sends a reply to the patient via the configured messaging gateway
 * (Business API → Baileys → SMS → console fallback) and logs the
 * outbound message in CommunicationLog so it appears on the Comms
 * tab timeline alongside their inbound messages.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { sendMessage } from "@/lib/messaging";
import { logger } from "@/lib/logger";

const schema = z.object({
  message: z.string().max(2000),
  type: z.enum(["whatsapp", "sms"]).optional(),
  mediaUrl: z.string().max(500).optional(),
  mediaMimeType: z.string().max(120).optional(),
}).refine((d) => d.message.trim().length > 0 || (!!d.mediaUrl && !!d.mediaMimeType), {
  message: "Either a message or an attachment is required",
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const patient = await prisma.patient.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, phone: true, tenantId: true },
    });
    if (!patient) {
      return NextResponse.json({ success: false, error: "patient_not_found" }, { status: 404 });
    }
    if (!patient.phone) {
      return NextResponse.json({ success: false, error: "no_phone_on_file" }, { status: 400 });
    }

    // Fire the message through the messaging chain. The chain returns
    // success+channel even when no gateway is configured (logs to
    // console), so we still want to record what was attempted.
    const result = await sendMessage({
      to: patient.phone,
      message: parsed.data.message,
      type: parsed.data.type ?? "whatsapp",
      mediaUrl: parsed.data.mediaUrl,
      mediaMimeType: parsed.data.mediaMimeType,
    });

    const log = await prisma.communicationLog.create({
      data: {
        patientId: patient.id,
        type: result.channel === "sms" ? "SMS"
            : result.channel === "whatsapp" ? "WHATSAPP"
            : "SYSTEM", // "none" channel — logged only, no gateway
        direction: "OUTBOUND",
        subject: "Reply",
        content: parsed.data.message,
        mediaUrl: parsed.data.mediaUrl ?? null,
        mediaMimeType: parsed.data.mediaMimeType ?? null,
        sentById: auth.user.id,
        sentByName: auth.user.name ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        log,
        channel: result.channel,
        delivered: result.success,
        messageId: result.messageId,
      },
    }, { status: 201 });
  } catch (err) {
    logger.api("POST", `/api/patients/${id}/communications/reply`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
