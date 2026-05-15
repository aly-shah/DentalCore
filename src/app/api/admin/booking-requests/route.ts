/**
 * @route GET /api/admin/booking-requests
 *
 * Front-desk inbox for online booking requests.
 *
 * Query params:
 *   status  - PENDING | CONFIRMED | REJECTED | CANCELLED (default PENDING)
 *   q       - free text over name/phone/email
 *   limit   - max rows (default 100, max 500)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST", "DOCTOR"] });
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get("status") ?? "PENDING").toUpperCase();
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 500);

    const rows = await prisma.bookingRequest.findMany({
      where: {
        status,
        ...(q
          ? {
              OR: [
                { name:  { contains: q, mode: "insensitive" } },
                { phone: { contains: q.replace(/[^0-9]/g, "") || q } },
                { email: { contains: q, mode: "insensitive" } },
                { treatmentName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ status: "asc" }, { preferredDate: "asc" }, { preferredStart: "asc" }],
      take: limit,
      include: {
        doctor:  { select: { id: true, name: true } },
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        branch:  { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    logger.api("GET", "/api/admin/booking-requests", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
