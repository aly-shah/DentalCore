/**
 * @system DentaCore ERP — Messaging API
 * @route POST /api/messaging — Send WhatsApp/SMS message
 */
import { NextResponse } from "next/server";
import { sendMessage } from "@/lib/messaging";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();
    const { to, message, type, patientId, subject } = body;

    if (!to || !message) {
      return NextResponse.json({ success: false, error: "Missing: to, message" }, { status: 400 });
    }

    // Send via messaging service
    const result = await sendMessage({ to, message, type: type || "whatsapp" });

    // Log the communication. Caller is authenticated, so prefer the
    // session user as the sender attribution. sentById is nullable in
    // the schema (so null is fine), but if the route was explicitly
    // told who sent it, use that.
    if (patientId) {
      await prisma.communicationLog.create({
        data: {
          patientId,
          type: type === "sms" ? "SMS" : "WHATSAPP",
          direction: "OUTBOUND",
          subject: subject || "Message sent",
          content: message,
          sentById: body.sentById || auth.user.id,
          sentByName: body.sentByName ?? auth.user.name ?? null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        channel: result.channel,
        messageId: result.messageId,
        delivered: result.success,
      },
    });
  } catch (error) {
    logger.api("POST", "/api/messaging", error);
    return NextResponse.json({ success: false, error: "Failed to send message" }, { status: 500 });
  }
}
