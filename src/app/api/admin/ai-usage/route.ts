/**
 * @route GET /api/admin/ai-usage
 * Aggregates AISuggestionLog rows for the AI cost dashboard.
 *
 * Returns:
 *   - totals { calls, costCents, avgLatencyMs }
 *   - bySubsystem [{ subsystem, calls, costCents, avgLatencyMs, acceptedCount, rejectedCount, erroredCount }]
 *   - byModel [{ modelId, modelName, calls, costCents }]
 *   - dailyTrend [{ date, calls, costCents }] — last 30 days
 *
 * Read-only, admin-only. Honors the requested date range via ?from / ?to
 * (default: last 30 days).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(now.getDate() - 30);

    const fromDate = from ? new Date(from) : defaultFrom;
    const toDate = to ? new Date(to) : now;

    const where = { createdAt: { gte: fromDate, lte: toDate } };

    const [
      totalsAgg,
      bySubsystemRaw,
      byModelRaw,
      dailyRaw,
      modelVersions,
    ] = await Promise.all([
      prisma.aISuggestionLog.aggregate({
        where,
        _count: true,
        _sum: { costCents: true },
        _avg: { latencyMs: true },
      }),
      prisma.aISuggestionLog.groupBy({
        by: ["subsystem", "status"],
        where,
        _count: { _all: true },
        _sum: { costCents: true },
        _avg: { latencyMs: true },
      }),
      prisma.aISuggestionLog.groupBy({
        by: ["modelVersionId"],
        where,
        _count: { _all: true },
        _sum: { costCents: true },
      }),
      // Postgres-friendly daily aggregation via raw SQL — Prisma can't
      // truncate datetimes inside groupBy.
      prisma.$queryRaw<Array<{ day: Date; calls: bigint; cost_cents: number | null }>>`
        SELECT date_trunc('day', "createdAt") AS day,
               count(*)::bigint AS calls,
               sum("costCents") AS cost_cents
        FROM "AISuggestionLog"
        WHERE "createdAt" >= ${fromDate} AND "createdAt" <= ${toDate}
        GROUP BY day
        ORDER BY day ASC
      `,
      prisma.aIModelVersion.findMany({
        select: { id: true, name: true, modelId: true, provider: true, promptVersion: true },
      }),
    ]);

    const modelMap = new Map(modelVersions.map((m) => [m.id, m]));

    // Collapse subsystem-status pairs into one row per subsystem
    const subsystemMap = new Map<string, {
      subsystem: string;
      calls: number;
      costCents: number;
      avgLatencyMs: number;
      acceptedCount: number;
      rejectedCount: number;
      erroredCount: number;
      latencySum: number;
      latencyN: number;
    }>();
    for (const row of bySubsystemRaw) {
      const sub = row.subsystem;
      const existing = subsystemMap.get(sub) ?? {
        subsystem: sub,
        calls: 0,
        costCents: 0,
        avgLatencyMs: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        erroredCount: 0,
        latencySum: 0,
        latencyN: 0,
      };
      const calls = row._count?._all ?? 0;
      existing.calls += calls;
      existing.costCents += row._sum?.costCents ?? 0;
      if (row._avg?.latencyMs != null) {
        existing.latencySum += row._avg.latencyMs * calls;
        existing.latencyN += calls;
      }
      if (row.status === "ACCEPTED") existing.acceptedCount += calls;
      else if (row.status === "REJECTED") existing.rejectedCount += calls;
      else if (row.status === "ERRORED") existing.erroredCount += calls;
      subsystemMap.set(sub, existing);
    }
    const bySubsystem = [...subsystemMap.values()]
      .map(({ latencySum, latencyN, ...rest }) => ({
        ...rest,
        avgLatencyMs: latencyN > 0 ? Math.round(latencySum / latencyN) : 0,
      }))
      .sort((a, b) => b.costCents - a.costCents);

    const byModel = byModelRaw.map((r) => {
      const m = modelMap.get(r.modelVersionId);
      return {
        modelVersionId: r.modelVersionId,
        modelId: m?.modelId ?? "unknown",
        modelName: m?.name ?? "unknown",
        provider: m?.provider ?? "unknown",
        promptVersion: m?.promptVersion ?? "",
        calls: r._count?._all ?? 0,
        costCents: r._sum?.costCents ?? 0,
      };
    }).sort((a, b) => b.costCents - a.costCents);

    const dailyTrend = dailyRaw.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      calls: Number(row.calls),
      costCents: row.cost_cents ?? 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        range: { from: fromDate.toISOString(), to: toDate.toISOString() },
        totals: {
          calls: totalsAgg._count ?? 0,
          costCents: totalsAgg._sum.costCents ?? 0,
          avgLatencyMs: Math.round(totalsAgg._avg.latencyMs ?? 0),
        },
        bySubsystem,
        byModel,
        dailyTrend,
      },
    });
  } catch (err) {
    logger.api("GET", "/api/admin/ai-usage", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
