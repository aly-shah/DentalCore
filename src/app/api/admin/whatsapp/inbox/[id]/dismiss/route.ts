/**
 * @route POST /api/admin/whatsapp/inbox/[id]/dismiss
 * Marks an unmatched inbound message as DISMISSED (spam / wrong number
 * / non-patient inquiry). The row is preserved for audit history.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const row = await prisma.unmatchedInboundMessage.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    if (row.status !== "UNMATCHED") {
      return NextResponse.json({ success: false, error: `already_${row.status.toLowerCase()}` }, { status: 409 });
    }

    await prisma.unmatchedInboundMessage.update({
      where: { id },
      data: {
        status: "DISMISSED",
        dismissedByUserId: auth.user.id,
        dismissedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.api("POST", `/api/admin/whatsapp/inbox/${id}/dismiss`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
