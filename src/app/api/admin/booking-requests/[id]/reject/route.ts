/**
 * @route POST /api/admin/booking-requests/[id]/reject
 * Body: { reason?: string; notify?: boolean (default true) }
 *
 * Marks a booking request as REJECTED and optionally sends a polite
 * message to the requester asking them to call the clinic or pick a
 * different slot. We never delete — the record stays around for
 * conversion analytics.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { sendMessage } from "@/lib/messaging";
import { logger } from "@/lib/logger";

const schema = z.object({
  reason: z.string().max(500).optional(),
  notify: z.boolean().optional().default(true),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "validation_failed", fields: parsed.error.flatten() }, { status: 400 });
    }

    const req = await prisma.bookingRequest.findUnique({ where: { id } });
    if (!req) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    if (req.status !== "PENDING") {
      return NextResponse.json({ success: false, error: `already_${req.status.toLowerCase()}` }, { status: 409 });
    }

    await prisma.bookingRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectedById: auth.user.id,
        rejectionReason: parsed.data.reason ?? null,
      },
    });

    if (parsed.data.notify) {
      try {
        const channel: "whatsapp" | "sms" | "email" = req.email ? "email" : "whatsapp";
        const reasonLine = parsed.data.reason ? `\n\nReason: ${parsed.data.reason}` : "";
        await sendMessage({
          to: channel === "email" ? (req.email ?? "") : req.phone,
          message:
            `Hi ${req.name}, unfortunately we can't accommodate your requested ` +
            `slot on ${req.preferredDate.toISOString().slice(0,10)} at ${req.preferredStart}. ` +
            `Please call us to pick another time.${reasonLine}`,
          type: channel,
          subject: "About your appointment request",
        });
      } catch (err) {
        logger.warn("booking-reject: notification failed", { err: String(err), id });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.api("POST", `/api/admin/booking-requests/${id}/reject`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
