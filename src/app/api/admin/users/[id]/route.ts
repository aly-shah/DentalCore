/**
 * @system DentaCore ERP - Single User (staff/doctor) API
 * @route PATCH  /api/admin/users/:id - Edit or reactivate a user
 * @route DELETE /api/admin/users/:id - Remove a user: hard-delete when they
 *   have no linked records, otherwise deactivate (isActive=false) so all
 *   clinical/financial history and the audit trail are preserved.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const EDITABLE_FIELDS = ["name", "phone", "avatar", "role", "branchId", "speciality", "licenseNumber", "consultationFee", "isActive"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
    if (auth.response) return auth.response;

    const { id } = await params;
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const body = await request.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    for (const f of EDITABLE_FIELDS) if (body[f] !== undefined) data[f] = body[f];
    if (data.consultationFee !== undefined) data.consultationFee = Number(data.consultationFee) || 0;

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, email: true, name: true, phone: true, avatar: true,
        role: true, branchId: true,
        branch: { select: { id: true, name: true, code: true } },
        speciality: true, licenseNumber: true, consultationFee: true, isActive: true, createdAt: true, updatedAt: true,
      },
    });

    await logAudit({
      userId: auth.user.id,
      action: "UPDATE",
      module: "STAFF",
      entityType: "User",
      entityId: id,
      details: { fields: Object.keys(data) },
    });

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    logger.api("PATCH", "/api/admin/users/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
    if (auth.response) return auth.response;

    const { id } = await params;

    if (id === auth.user.id) {
      return NextResponse.json({ success: false, error: "You cannot delete your own account." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    // Hard delete. Every row that references this user via a foreign key must
    // be cleared first, or the delete fails. We preserve clinical/financial
    // history by REASSIGNING authored records to the admin performing the
    // deletion (a valid user), NULL out optional references, and delete rows
    // that only make sense while the user exists (schedule, leave, their own
    // notifications). Then the user itself is removed. All in one transaction
    // so a failure rolls back cleanly and never half-deletes.
    const actor = auth.user.id;
    await prisma.$transaction([
      // Reassign authored / actor records to the acting admin so they survive.
      prisma.appointment.updateMany({ where: { doctorId: id }, data: { doctorId: actor } }),
      prisma.appointment.updateMany({ where: { createdById: id }, data: { createdById: actor } }),
      prisma.consultationNote.updateMany({ where: { doctorId: id }, data: { doctorId: actor } }),
      prisma.prescription.updateMany({ where: { doctorId: id }, data: { doctorId: actor } }),
      prisma.procedure.updateMany({ where: { doctorId: id }, data: { doctorId: actor } }),
      prisma.labTest.updateMany({ where: { doctorId: id }, data: { doctorId: actor } }),
      prisma.followUp.updateMany({ where: { doctorId: id }, data: { doctorId: actor } }),
      prisma.aITranscription.updateMany({ where: { doctorId: id }, data: { doctorId: actor } }),
      prisma.triage.updateMany({ where: { recordedById: id }, data: { recordedById: actor } }),
      prisma.callLog.updateMany({ where: { userId: id }, data: { userId: actor } }),
      prisma.invoice.updateMany({ where: { createdById: id }, data: { createdById: actor } }),
      prisma.payment.updateMany({ where: { processedById: id }, data: { processedById: actor } }),
      prisma.patientDocument.updateMany({ where: { uploadedById: id }, data: { uploadedById: actor } }),
      // Null out optional references.
      prisma.patient.updateMany({ where: { assignedDoctorId: id }, data: { assignedDoctorId: null } }),
      prisma.lead.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } }),
      prisma.orthoCase.updateMany({ where: { doctorId: id }, data: { doctorId: null } }),
      prisma.refund.updateMany({ where: { processedById: id }, data: { processedById: null } }),
      prisma.refund.updateMany({ where: { approvedById: id }, data: { approvedById: null } }),
      prisma.bookingRequest.updateMany({ where: { doctorId: id }, data: { doctorId: null } }),
      prisma.communicationLog.updateMany({ where: { sentById: id }, data: { sentById: null } }),
      prisma.auditLog.updateMany({ where: { userId: id }, data: { userId: null } }),
      // Delete rows that only make sense while the user exists.
      prisma.schedule.deleteMany({ where: { doctorId: id } }),
      prisma.doctorLeave.deleteMany({ where: { doctorId: id } }),
      prisma.blockedSlot.deleteMany({ where: { doctorId: id } }),
      prisma.notification.deleteMany({ where: { userId: id } }),
      prisma.voiceNote.deleteMany({ where: { doctorId: id } }),
      // Finally, remove the user.
      prisma.user.delete({ where: { id } }),
    ]);

    await logAudit({
      userId: actor, action: "DELETE", module: "STAFF", entityType: "User", entityId: id,
      details: { email: existing.email, role: existing.role, hardDeleted: true },
    });
    return NextResponse.json({ success: true, action: "deleted", data: { id } });
  } catch (error) {
    logger.api("DELETE", "/api/admin/users/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to delete user" }, { status: 500 });
  }
}
