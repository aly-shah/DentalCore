/**
 * @route DELETE /api/admin/tenants/[id]/hostnames/[hostnameId]
 * Detach a hostname from a tenant. Hard-delete is fine — once a hostname
 * is unbound it should be reusable by another tenant.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { bypassTenantScope } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; hostnameId: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN"] });
  if (auth.response) return auth.response;
  const { id: tenantId, hostnameId } = await params;

  try {
    const row = await bypassTenantScope(() =>
      prisma.tenantHostname.findUnique({ where: { id: hostnameId }, select: { tenantId: true } })
    );
    if (!row) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    if (row.tenantId !== tenantId) {
      return NextResponse.json({ success: false, error: "wrong_tenant" }, { status: 403 });
    }
    await bypassTenantScope(() => prisma.tenantHostname.delete({ where: { id: hostnameId } }));
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.api("DELETE", `/api/admin/tenants/${tenantId}/hostnames/${hostnameId}`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
