/**
 * @route GET /api/admin/messages
 * Cross-patient communications inbox. Returns one row per patient
 * (the latest message), ordered by most-recent activity, with an
 * unread count for inbound-since-last-outbound conversations.
 *
 * Query params:
 *   q       — free-text search across patient name/phone or message content
 *   limit   — max threads (default 50, max 200)
 *   filter  — "all" | "unread" | "inbound" | "outbound"  (default "all")
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

interface ThreadRow {
  patientId: string;
  patientName: string;
  patientCode: string;
  phone: string | null;
  lastMessage: {
    id: string;
    type: string;
    direction: "INBOUND" | "OUTBOUND";
    content: string;
    mediaUrl: string | null;
    mediaMimeType: string | null;
    createdAt: string;
  };
  unreadCount: number; // INBOUND rows newer than the latest OUTBOUND
  totalCount: number;
}

export async function GET(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST"] });
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);
    const filter = (searchParams.get("filter") ?? "all").toLowerCase();

    // Latest createdAt per patient — this is the thread "head".
    // groupBy + take=limit works because Prisma + Postgres can order
    // a grouped query by an aggregate column. We then hydrate patient
    // and message details in two follow-up queries.
    const groups = await prisma.communicationLog.groupBy({
      by: ["patientId"],
      where: {
        type: { in: ["WHATSAPP", "SMS"] },
        ...(filter === "inbound"  ? { direction: "INBOUND"  } : {}),
        ...(filter === "outbound" ? { direction: "OUTBOUND" } : {}),
        ...(q
          ? {
              OR: [
                { content: { contains: q, mode: "insensitive" } },
                { sentByName: { contains: q, mode: "insensitive" } },
                { patient: {
                    OR: [
                      { firstName: { contains: q, mode: "insensitive" } },
                      { lastName:  { contains: q, mode: "insensitive" } },
                      { patientCode: { contains: q, mode: "insensitive" } },
                      { phone: { contains: q.replace(/[^0-9]/g, "") || q } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      _max: { createdAt: true },
      _count: { _all: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: limit * 2, // overshoot so unread filter can drop some
    });

    if (groups.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Hydrate the latest message per patient. We could do this in one
    // sub-query, but two trivial round-trips are easier to reason about
    // and small enough to stay fast.
    const patientIds = groups.map((g) => g.patientId);
    const lastMessages = await Promise.all(
      groups.map((g) =>
        prisma.communicationLog.findFirst({
          where: { patientId: g.patientId, type: { in: ["WHATSAPP", "SMS"] } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true, type: true, direction: true, content: true,
            mediaUrl: true, mediaMimeType: true, createdAt: true,
          },
        })
      )
    );

    const patients = await prisma.patient.findMany({
      where: { id: { in: patientIds }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true },
    });
    const patientMap = new Map(patients.map((p) => [p.id, p]));

    // Compute unread (INBOUND since latest OUTBOUND) per thread.
    // One query per thread again — acceptable at this scale; if it
    // ever shows up in p95, we can switch to a single raw SQL.
    const unreadCounts = await Promise.all(
      groups.map(async (g) => {
        const latestOutbound = await prisma.communicationLog.findFirst({
          where: { patientId: g.patientId, direction: "OUTBOUND", type: { in: ["WHATSAPP", "SMS"] } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        const since = latestOutbound?.createdAt ?? new Date(0);
        return prisma.communicationLog.count({
          where: {
            patientId: g.patientId,
            direction: "INBOUND",
            type: { in: ["WHATSAPP", "SMS"] },
            createdAt: { gt: since },
          },
        });
      })
    );

    const rows: ThreadRow[] = groups
      .map((g, i) => {
        const last = lastMessages[i];
        const p = patientMap.get(g.patientId);
        if (!last || !p) return null;
        return {
          patientId: g.patientId,
          patientName: `${p.firstName} ${p.lastName}`,
          patientCode: p.patientCode,
          phone: p.phone,
          lastMessage: {
            id: last.id,
            type: last.type,
            direction: last.direction as "INBOUND" | "OUTBOUND",
            content: last.content,
            mediaUrl: last.mediaUrl,
            mediaMimeType: last.mediaMimeType,
            createdAt: last.createdAt.toISOString(),
          },
          unreadCount: unreadCounts[i],
          totalCount: g._count._all,
        } satisfies ThreadRow;
      })
      .filter((r): r is ThreadRow => r !== null)
      .filter((r) => filter !== "unread" || r.unreadCount > 0)
      .slice(0, limit);

    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    logger.api("GET", "/api/admin/messages", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
