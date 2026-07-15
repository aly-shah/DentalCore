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

const EDITABLE_FIELDS = ["name", "phone", "avatar", "role", "branchId", "speciality", "licenseNumber", "isActive"] as const;

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

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, email: true, name: true, phone: true, avatar: true,
        role: true, branchId: true,
        branch: { select: { id: true, name: true, code: true } },
        speciality: true, licenseNumber: true, isActive: true, createdAt: true, updatedAt: true,
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

    // Count records that reference this user. If any exist, a hard delete
    // would orphan clinical/financial history, so we deactivate instead.
    const [appts, createdAppts, notes, rx, procedures, labs, invoices, payments, schedules, patients] = await Promise.all([
      prisma.appointment.count({ where: { doctorId: id } }),
      prisma.appointment.count({ where: { createdById: id } }),
      prisma.consultationNote.count({ where: { doctorId: id } }),
      prisma.prescription.count({ where: { doctorId: id } }),
      prisma.procedure.count({ where: { doctorId: id } }),
      prisma.labTest.count({ where: { doctorId: id } }).catch(() => 0),
      prisma.invoice.count({ where: { createdById: id } }),
      prisma.payment.count({ where: { processedById: id } }).catch(() => 0),
      prisma.schedule.count({ where: { doctorId: id } }).catch(() => 0),
      prisma.patient.count({ where: { assignedDoctorId: id } }),
    ]);
    const linked = appts + createdAppts + notes + rx + procedures + labs + invoices + payments + schedules + patients;

    if (linked > 0) {
      const user = await prisma.user.update({ where: { id }, data: { isActive: false } });
      await logAudit({
        userId: auth.user.id, action: "UPDATE", module: "STAFF", entityType: "User", entityId: id,
        details: { deactivated: true, linkedRecords: linked, email: existing.email },
      });
      return NextResponse.json({ success: true, action: "deactivated", data: { id: user.id, isActive: false }, linkedRecords: linked });
    }

    await prisma.user.delete({ where: { id } });
    await logAudit({
      userId: auth.user.id, action: "DELETE", module: "STAFF", entityType: "User", entityId: id,
      details: { email: existing.email, role: existing.role },
    });
    return NextResponse.json({ success: true, action: "deleted", data: { id } });
  } catch (error) {
    logger.api("DELETE", "/api/admin/users/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to delete user" }, { status: 500 });
  }
}
