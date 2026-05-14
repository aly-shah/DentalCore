/**
 * @route POST /api/admin/tenants/[id]/hostnames — attach a hostname
 * @route GET  /api/admin/tenants/[id]/hostnames — list (nested under tenant)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { bypassTenantScope } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";

const createSchema = z.object({
  hostname: z.string().min(3).max(253).regex(/^[a-z0-9.-]+$/, "lowercase, digits, dot, hyphen only"),
  type: z.enum(["CUSTOM", "SUBDOMAIN", "DEFAULT"]).default("CUSTOM"),
  tlsManagedBy: z.enum(["PLATFORM", "CUSTOMER"]).default("PLATFORM"),
  isPrimary: z.boolean().default(false),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const hostnames = await bypassTenantScope(() =>
      prisma.tenantHostname.findMany({
        where: { tenantId: id },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      })
    );
    return NextResponse.json({ success: true, data: hostnames });
  } catch (err) {
    logger.api("GET", `/api/admin/tenants/${id}/hostnames`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN"] });
  if (auth.response) return auth.response;
  const { id: tenantId } = await params;

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Hostname is globally unique — bypass scope for the dup check.
    const exists = await bypassTenantScope(() =>
      prisma.tenantHostname.findUnique({ where: { hostname: parsed.data.hostname }, select: { id: true, tenantId: true } })
    );
    if (exists) {
      return NextResponse.json(
        { success: false, error: exists.tenantId === tenantId ? "already_attached" : "hostname_taken" },
        { status: 409 }
      );
    }

    const hostname = await bypassTenantScope(async () => {
      // If this new entry is primary, unset isPrimary on the tenant's
      // existing rows so we never have two primaries.
      if (parsed.data.isPrimary) {
        await prisma.tenantHostname.updateMany({
          where: { tenantId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return prisma.tenantHostname.create({
        data: { ...parsed.data, tenantId },
      });
    });

    return NextResponse.json({ success: true, data: hostname }, { status: 201 });
  } catch (err) {
    logger.api("POST", `/api/admin/tenants/${tenantId}/hostnames`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
