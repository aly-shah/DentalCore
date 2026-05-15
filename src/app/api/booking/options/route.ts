/**
 * @route GET /api/booking/options
 *
 * Public endpoint — returns the data needed to render the booking
 * wizard's first screens: bookable treatments, branches, and a doctor
 * list. Intentionally lean: no internal fields (cost basis, schedule,
 * etc.) — only what the patient needs to make a choice.
 *
 * Query params:
 *   tenantId  - reserved for multi-tenant booking on a per-domain basis
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bypassTenantScope } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const data = await bypassTenantScope(async () => {
      const [treatments, branches, doctors] = await Promise.all([
        prisma.treatment.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            category: true,
            duration: true,
            description: true,
            basePrice: true,
          },
          orderBy: [{ category: "asc" }, { name: "asc" }],
          take: 200,
        }),
        prisma.branch.findMany({
          where: { isActive: true },
          select: { id: true, name: true, address: true, phone: true },
          orderBy: { name: "asc" },
        }),
        prisma.user.findMany({
          where: { role: "DOCTOR", isActive: true },
          select: { id: true, name: true, speciality: true, branchId: true },
          orderBy: { name: "asc" },
        }),
      ]);
      return { treatments, branches, doctors };
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    logger.api("GET", "/api/booking/options", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
