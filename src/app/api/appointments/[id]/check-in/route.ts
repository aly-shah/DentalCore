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

    // Auto-open a DRAFT invoice for this visit on check-in, with the assigned
    // doctor's consultation fee already on it, so billing isn't re-typing it.
    // Always created (even when the fee is 0) so every checked-in visit has an
    // invoice to work from — it's just a zero-value draft the front desk can
    // add line items to. Skipped only when the appointment already has one
    // (idempotent re-check-in).
    //
    // The check-in itself has already been persisted above, so a billing
    // failure here must never fail the request — it's logged and swallowed.
    const fee = appointment.doctor?.consultationFee ?? 0;
    let invoice = null;
    try {
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
    } catch (billingError) {
      logger.api("POST", "/api/appointments/[id]/check-in (consultation invoice)", billingError);
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
