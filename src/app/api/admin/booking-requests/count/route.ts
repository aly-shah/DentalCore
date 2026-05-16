/**
 * @route GET /api/admin/booking-requests/count
 * Cheap count of PENDING online bookings — polled by the sidebar
 * badge. Returns { count: number }.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET() {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST", "DOCTOR"] });
  if (auth.response) return auth.response;

  try {
    const count = await prisma.bookingRequest.count({ where: { status: "PENDING" } });
    return NextResponse.json({ success: true, data: { count } });
  } catch (err) {
    logger.api("GET", "/api/admin/booking-requests/count", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
