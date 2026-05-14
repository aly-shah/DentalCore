/**
 * @route GET    /api/admin/tenants/[id] — read
 * @route PUT    /api/admin/tenants/[id] — update
 * @route DELETE /api/admin/tenants/[id] — soft-delete (status=ARCHIVED)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { bypassTenantScope } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  legalName: z.string().max(200).nullable().optional(),
  plan: z.enum(["FREE", "PRO", "GROUP", "ENTERPRISE"]).optional(),
  status: z.enum(["ACTIVE", "TRIAL", "SUSPENDED", "CHURNED", "ARCHIVED"]).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  wordmarkUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  locale: z.string().max(10).optional(),
  currency: z.string().max(10).optional(),
  timezone: z.string().max(50).optional(),
  dateFormat: z.string().max(20).optional(),
  region: z.string().max(20).optional(),
  hipaaCovered: z.boolean().optional(),
  gdprCovered: z.boolean().optional(),
  maxUsers: z.number().int().min(1).nullable().optional(),
  maxBranches: z.number().int().min(1).nullable().optional(),
  maxPatients: z.number().int().min(0).nullable().optional(),
  monthlyAiBudgetCents: z.number().int().min(0).nullable().optional(),
  storageQuotaGB: z.number().nonnegative().nullable().optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  suspendedReason: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const tenant = await bypassTenantScope(() =>
      prisma.tenant.findUnique({
        where: { id },
        include: {
          hostnames: { orderBy: { isPrimary: "desc" } },
          _count: { select: { users: true, branches: true, patients: true } },
        },
      })
    );
    if (!tenant) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ success: true, data: tenant });
  } catch (err) {
    logger.api("GET", `/api/admin/tenants/${id}`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data;
    const tenant = await bypassTenantScope(() =>
      prisma.tenant.update({
        where: { id },
        data: {
          ...data,
          trialEndsAt: data.trialEndsAt === undefined ? undefined : data.trialEndsAt ? new Date(data.trialEndsAt) : null,
          suspendedAt: data.status === "SUSPENDED" ? new Date() : undefined,
        },
      })
    );
    return NextResponse.json({ success: true, data: tenant });
  } catch (err) {
    logger.api("PUT", `/api/admin/tenants/${id}`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    // Soft-delete via status. Tenants own a lot of clinical data; hard
    // delete would cascade catastrophically. Archive is the safe move.
    const tenant = await bypassTenantScope(() =>
      prisma.tenant.update({
        where: { id },
        data: { status: "ARCHIVED" },
      })
    );
    return NextResponse.json({ success: true, data: tenant });
  } catch (err) {
    logger.api("DELETE", `/api/admin/tenants/${id}`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
