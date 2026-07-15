/**
 * @system DentaCore ERP - Single Branch API
 * @route PATCH  /api/admin/branches/:id - Edit or reactivate a branch
 * @route DELETE /api/admin/branches/:id - Remove a branch: hard-delete when it
 *   has no linked records, otherwise deactivate (isActive=false) to preserve
 *   the users/patients/appointments/invoices attached to it.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const EDITABLE_FIELDS = ["name", "code", "address", "phone", "email", "timezone", "isActive"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { id } = await params;
    const existing = await prisma.branch.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Branch not found" }, { status: 404 });

    const body = await request.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    for (const f of EDITABLE_FIELDS) if (body[f] !== undefined) data[f] = body[f];

    const branch = await prisma.branch.update({ where: { id }, data });
    await logAudit({
      userId: auth.user.id, action: "UPDATE", module: "BRANCH", entityType: "Branch", entityId: id,
      details: { fields: Object.keys(data) },
    });
    return NextResponse.json({ success: true, data: branch });
  } catch (error) {
    logger.api("PATCH", "/api/admin/branches/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to update branch" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { id } = await params;
    const existing = await prisma.branch.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Branch not found" }, { status: 404 });

    // Block hard delete when the branch still has dependent records.
    const [users, patients, appts, rooms, invoices, products] = await Promise.all([
      prisma.user.count({ where: { branchId: id } }),
      prisma.patient.count({ where: { branchId: id } }),
      prisma.appointment.count({ where: { branchId: id } }),
      prisma.room.count({ where: { branchId: id } }),
      prisma.invoice.count({ where: { branchId: id } }),
      prisma.product.count({ where: { branchId: id } }).catch(() => 0),
    ]);
    const linked = users + patients + appts + rooms + invoices + products;

    if (linked > 0) {
      const branch = await prisma.branch.update({ where: { id }, data: { isActive: false } });
      await logAudit({
        userId: auth.user.id, action: "UPDATE", module: "BRANCH", entityType: "Branch", entityId: id,
        details: { deactivated: true, linkedRecords: linked, name: existing.name },
      });
      return NextResponse.json({ success: true, action: "deactivated", data: { id: branch.id, isActive: false }, linkedRecords: linked });
    }

    await prisma.branch.delete({ where: { id } });
    await logAudit({
      userId: auth.user.id, action: "DELETE", module: "BRANCH", entityType: "Branch", entityId: id,
      details: { name: existing.name, code: existing.code },
    });
    return NextResponse.json({ success: true, action: "deleted", data: { id } });
  } catch (error) {
    logger.api("DELETE", "/api/admin/branches/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to delete branch" }, { status: 500 });
  }
}
