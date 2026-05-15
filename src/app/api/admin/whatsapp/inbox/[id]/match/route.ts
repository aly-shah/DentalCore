/**
 * @route POST /api/admin/whatsapp/inbox/[id]/match
 * Body: { patientId: string }
 *
 * Moves an unmatched inbound message to the named patient's
 * communication timeline. In a transaction:
 *   1. Mark the UnmatchedInboundMessage as MATCHED + record who/when.
 *   2. Write a CommunicationLog row (INBOUND) — the patient's Comms
 *      tab now shows the message, same as if it had matched on first
 *      receipt.
 *   3. Notify the patient's assigned doctor (if any) via Notification.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const schema = z.object({ patientId: z.string().min(1) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] });
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

    const row = await prisma.unmatchedInboundMessage.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    if (row.status !== "UNMATCHED") {
      return NextResponse.json({ success: false, error: `already_${row.status.toLowerCase()}` }, { status: 409 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: parsed.data.patientId },
      select: { id: true, firstName: true, lastName: true, assignedDoctorId: true, tenantId: true },
    });
    if (!patient) return NextResponse.json({ success: false, error: "patient_not_found" }, { status: 404 });

    const subject = `wa-inbound:${row.externalId}`;

    await prisma.$transaction(async (tx) => {
      // Flip the inbox row
      await tx.unmatchedInboundMessage.update({
        where: { id },
        data: {
          status: "MATCHED",
          matchedPatientId: patient.id,
          matchedByUserId: auth.user.id,
          matchedAt: new Date(),
        },
      });

      // Mirror into the patient's communication timeline. Idempotent —
      // if a row with this subject already exists (e.g., the patient
      // was created between receipt and match), don't double-write.
      const exists = await tx.communicationLog.findFirst({ where: { subject }, select: { id: true } });
      if (!exists) {
        await tx.communicationLog.create({
          data: {
            patientId: patient.id,
            type: row.channel === "SMS" ? "SMS" : "WHATSAPP",
            direction: "INBOUND",
            subject,
            content: row.content,
            mediaUrl: row.mediaUrl,
            mediaMimeType: row.mediaMimeType,
            sentByName: row.fromName ?? `${patient.firstName} ${patient.lastName}`,
          },
        });
      }

      if (patient.assignedDoctorId) {
        await tx.notification.upsert({
          where: { userId_dedupKey: { userId: patient.assignedDoctorId, dedupKey: subject } },
          create: {
            userId: patient.assignedDoctorId,
            dedupKey: subject,
            title: `New ${row.channel.toLowerCase()} from ${patient.firstName} ${patient.lastName}`,
            message: row.content.length > 120 ? row.content.slice(0, 117) + "…" : row.content,
            type: "COMMUNICATION",
            link: `/patients/${patient.id}?tab=comms`,
            tenantId: patient.tenantId ?? null,
          },
          update: {},
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.api("POST", `/api/admin/whatsapp/inbox/${id}/match`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
