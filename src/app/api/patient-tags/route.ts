/**
 * @system DentaCore ERP — Patient tags (distinct list)
 * @route GET /api/patient-tags — distinct tag names in use, for filter dropdowns
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const rows = await prisma.patientTag.findMany({
      select: { tag: true },
      distinct: ["tag"],
      orderBy: { tag: "asc" },
    });
    return NextResponse.json({ success: true, data: rows.map((r) => r.tag) });
  } catch (error) {
    logger.api("GET", "/api/patient-tags", error);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
