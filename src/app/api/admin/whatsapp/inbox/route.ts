/**
 * @route GET /api/admin/whatsapp/inbox
 * List unmatched inbound WhatsApp / SMS messages. Filterable by status.
 * Tenant-scoped via the Prisma extension. Admin / Super-admin only.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] });
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get("status") ?? "UNMATCHED").toUpperCase();
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);

    const rows = await prisma.unmatchedInboundMessage.findMany({
      where: status === "ALL" ? {} : { status: status as "UNMATCHED" | "MATCHED" | "DISMISSED" },
      orderBy: { receivedAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    logger.api("GET", "/api/admin/whatsapp/inbox", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
