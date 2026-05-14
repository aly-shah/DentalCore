/**
 * @route GET /api/admin/audit
 * Paginated audit log viewer.
 *
 * Query params:
 *   userId       — filter by actor
 *   entityType   — filter by entity (Patient, Invoice, AuditLog, ...)
 *   entityId     — filter by a specific entity row
 *   action       — filter by action verb (CREATE, UPDATE, DELETE, ...)
 *   module       — filter by module (PATIENT, BILLING, ...)
 *   q            — free-text search on userName, details
 *   from / to    — ISO date range
 *   cursor       — opaque pagination cursor (last seen id)
 *   limit        — max rows (default 50, max 200)
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const userId     = searchParams.get("userId") ?? undefined;
    const entityType = searchParams.get("entityType") ?? undefined;
    const entityId   = searchParams.get("entityId") ?? undefined;
    const action     = searchParams.get("action") ?? undefined;
    const module     = searchParams.get("module") ?? undefined;
    const q          = (searchParams.get("q") ?? "").trim();
    const from       = searchParams.get("from");
    const to         = searchParams.get("to");
    const cursor     = searchParams.get("cursor") ?? undefined;
    const limit      = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);

    const where: Prisma.AuditLogWhereInput = {};
    if (userId) where.userId = userId;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (action) where.action = action;
    if (module) where.module = module;
    if (from || to) {
      where.createdAt = {
        ...(from && { gte: new Date(from) }),
        ...(to   && { lte: new Date(to) }),
      };
    }
    if (q) {
      where.OR = [
        { userName: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { details: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

    return NextResponse.json({
      success: true,
      data: { items, nextCursor },
    });
  } catch (err) {
    logger.api("GET", "/api/admin/audit", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
