/**
 * @system DentaCore ERP - Appointment Check-In API
 * @route POST /api/appointments/:id/check-in - Check in patient
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;

    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Appointment not found" },
        { status: 404 }
      );
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        status: "CHECKED_IN",
        workflowStage: "CHECKIN",
        checkinTime: new Date(),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        doctor: { select: { id: true, name: true, consultationFee: true } },
      },
    });

    await logAudit({
      userId: "system",
      action: "CHECK_IN",
      module: "APPOINTMENT",
      entityType: "Appointment",
      entityId: appointment.id,
      details: { appointmentCode: appointment.appointmentCode },
    });

    // Auto-bill the doctor's consultation fee. On check-in we open a DRAFT
    // invoice for this visit with the assigned doctor's fee already on it, so
    // billing isn't re-typing it later. Skipped when an invoice already exists
    // for the appointment (idempotent re-check-in) or the fee is 0/unset.
    const fee = appointment.doctor?.consultationFee ?? 0;
    let invoice = null;
    if (fee > 0) {
      const existingInvoice = await prisma.invoice.findUnique({
        where: { appointmentId: appointment.id },
        select: { id: true },
      });
      if (!existingInvoice) {
        const count = await prisma.invoice.count();
        const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
        invoice = await prisma.invoice.create({
          data: {
            invoiceNumber,
            patientId: appointment.patientId,
            appointmentId: appointment.id,
            branchId: appointment.branchId,
            subtotal: fee,
            total: fee,
            balanceDue: fee,
            status: "DRAFT",
            createdById: auth.user.id,
            items: {
              create: [{
                description: `Consultation — ${appointment.doctor?.name ?? "Doctor"}`,
                type: "CONSULTATION",
                quantity: 1,
                unitPrice: fee,
                total: fee,
              }],
            },
          },
          select: { id: true, invoiceNumber: true, total: true },
        });
        await logAudit({
          userId: auth.user.id,
          action: "CREATE",
          module: "BILLING",
          entityType: "Invoice",
          entityId: invoice.id,
          details: { invoiceNumber: invoice.invoiceNumber, appointmentId: appointment.id, consultationFee: fee },
        });
      }
    }

    return NextResponse.json({ success: true, data: appointment, invoice });
  } catch (error) {
    logger.api("POST", "/api/appointments/[id]/check-in", error);
    return NextResponse.json(
      { success: false, error: "Failed to check in appointment" },
      { status: 500 }
    );
  }
}
