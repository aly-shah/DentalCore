/**
 * @route GET  /api/admin/tenants — list (SUPER_ADMIN only)
 * @route POST /api/admin/tenants — create
 *
 * IMPORTANT: bypasses the per-request tenant scope (SUPER_ADMIN is a
 * platform-level role that sees across tenants).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { bypassTenantScope } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";

const createSchema = z.object({
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, "Lowercase letters, digits, hyphens only"),
  name: z.string().min(1).max(200),
  legalName: z.string().max(200).optional(),
  plan: z.enum(["FREE", "PRO", "GROUP", "ENTERPRISE"]).default("FREE"),
  status: z.enum(["ACTIVE", "TRIAL", "SUSPENDED", "CHURNED", "ARCHIVED"]).default("TRIAL"),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  locale: z.string().max(10).optional(),
  currency: z.string().max(10).optional(),
  timezone: z.string().max(50).optional(),
  region: z.string().max(20).optional(),
  hipaaCovered: z.boolean().optional(),
  gdprCovered: z.boolean().optional(),
  maxUsers: z.number().int().min(1).optional(),
  maxBranches: z.number().int().min(1).optional(),
  maxPatients: z.number().int().min(0).optional(),
});

export async function GET(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN"] });
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const status = searchParams.get("status") ?? undefined;

    const tenants = await bypassTenantScope(() =>
      prisma.tenant.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(q ? {
            OR: [
              { slug: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { legalName: { contains: q, mode: "insensitive" } },
            ],
          } : {}),
        },
        include: {
          _count: {
            select: {
              users: true,
              branches: true,
              patients: true,
              hostnames: true,
            },
          },
          hostnames: {
            select: { id: true, hostname: true, type: true, isVerified: true, isPrimary: true },
            orderBy: { isPrimary: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    );

    return NextResponse.json({ success: true, data: tenants });
  } catch (err) {
    logger.api("GET", "/api/admin/tenants", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN"] });
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Duplicate-slug check bypasses scoping (slug is globally unique).
    const exists = await bypassTenantScope(() =>
      prisma.tenant.findUnique({ where: { slug: parsed.data.slug }, select: { id: true } })
    );
    if (exists) {
      return NextResponse.json({ success: false, error: "slug_already_exists" }, { status: 409 });
    }

    const tenant = await bypassTenantScope(() =>
      prisma.tenant.create({ data: parsed.data })
    );
    return NextResponse.json({ success: true, data: tenant }, { status: 201 });
  } catch (err) {
    logger.api("POST", "/api/admin/tenants", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
