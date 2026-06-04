"use client";

/**
 * AI Usage & Cost Dashboard — surfaces AISuggestionLog data.
 * Visible to ADMIN / SUPER_ADMIN.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, DollarSign, Clock, Activity, Loader2, AlertTriangle, CheckCircle2, XCircle, TrendingUp } from "lucide-react";
import { Card, CardListSkeleton, KpiSkeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

interface UsageResponse {
  range: { from: string; to: string };
  totals: { calls: number; costCents: number; avgLatencyMs: number };
  bySubsystem: {
    subsystem: string;
    calls: number;
    costCents: number;
    avgLatencyMs: number;
    acceptedCount: number;
    rejectedCount: number;
    erroredCount: number;
  }[];
  byModel: {
    modelVersionId: string;
    modelId: string;
    modelName: string;
    provider: string;
    promptVersion: string;
    calls: number;
    costCents: number;
  }[];
  dailyTrend: { date: string; calls: number; costCents: number }[];
}

// AI is billed by OpenAI in real USD, so spend stays in USD as the figure of
// record. We show a PKR estimate alongside the headline total for the PK team,
// at a configurable rate (NEXT_PUBLIC_USD_PKR_RATE, default ~Rs 280/USD).
const USD_PKR = Number(process.env.NEXT_PUBLIC_USD_PKR_RATE) || 280;
const currency = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    .format(cents / 100);
const pkrEstimate = (cents: number) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 })
    .format((cents / 100) * USD_PKR);

const SUBSYSTEM_LABELS: Record<string, string> = {
  "treatment-suggestion": "Treatment Suggestions",
  "tooth-findings":       "Tooth-Wise Findings",
  "patient-summary":      "Patient Briefing",
};

const SUBSYSTEM_GRADIENTS: Record<string, string> = {
  "treatment-suggestion": "from-blue-500 to-cyan-500",
  "tooth-findings":       "from-violet-500 to-pink-500",
  "patient-summary":      "from-emerald-500 to-teal-500",
};

const RANGES: { label: string; days: number }[] = [
  { label: "7 days",  days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

export default function AIUsagePage() {
  const [days, setDays] = useState(30);

  const { from, to } = useMemo(() => {
    const t = new Date();
    const f = new Date(t);
    f.setDate(t.getDate() - days);
    return { from: f.toISOString(), to: t.toISOString() };
  }, [days]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["ai-usage", days],
    queryFn: async (): Promise<UsageResponse> => {
      const r = await fetch(`/api/admin/ai-usage?from=${from}&to=${to}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="ADMIN-AI-USAGE">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 flex items-center justify-center shadow-md">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 leading-tight">AI Usage & Cost</h1>
            <p className="text-sm text-stone-500 mt-0.5">Spend, latency, and acceptance per subsystem</p>
          </div>
        </div>
        <div className="inline-flex bg-stone-100 rounded-lg p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={cn(
                "px-3 py-1.5 rounded-md text-[11px] font-bold transition-all",
                days === r.days ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <>
          <KpiSkeleton count={3} />
          <CardListSkeleton rows={3} />
        </>
      )}

      {isError && (
        <Card padding="lg">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-semibold">Couldn&apos;t load usage</span>
          </div>
          <p className="text-xs text-red-500 mt-1">{(error as Error).message}</p>
        </Card>
      )}

      {data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Kpi label="Total spend" value={currency(data.totals.costCents)} sub={`≈ ${pkrEstimate(data.totals.costCents)} @ Rs ${USD_PKR}/$`} icon={<DollarSign className="w-4 h-4" />} accent="blue" />
            <Kpi label="Total AI calls" value={data.totals.calls.toLocaleString()} icon={<Activity className="w-4 h-4" />} accent="violet" />
            <Kpi label="Avg latency" value={`${data.totals.avgLatencyMs}ms`} icon={<Clock className="w-4 h-4" />} accent="emerald" />
          </div>

          {/* By subsystem */}
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-stone-500 px-1 mb-2">By subsystem</h2>
            {data.bySubsystem.length === 0 ? (
              <Card padding="lg">
                <p className="text-sm text-stone-500 text-center py-4">No AI calls in this range.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {data.bySubsystem.map((s) => {
                  const gradient = SUBSYSTEM_GRADIENTS[s.subsystem] ?? "from-stone-500 to-stone-700";
                  const label = SUBSYSTEM_LABELS[s.subsystem] ?? s.subsystem;
                  const acceptRate = s.calls > 0 ? Math.round((s.acceptedCount / s.calls) * 100) : 0;
                  const errorRate = s.calls > 0 ? Math.round((s.erroredCount / s.calls) * 100) : 0;
                  return (
                    <article key={s.subsystem} className="bg-white rounded-2xl border-2 border-stone-200 overflow-hidden">
                      <div className={cn("h-1 bg-gradient-to-r", gradient)} />
                      <div className="p-3.5 space-y-2">
                        <div>
                          <p className="text-sm font-bold text-stone-900 leading-tight">{label}</p>
                          <p className="text-[10px] text-stone-400 font-mono mt-0.5">{s.subsystem}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-stone-100 text-[10px]">
                          <div>
                            <p className="text-stone-400 uppercase tracking-wide">Spend</p>
                            <p className="font-bold text-stone-900 text-sm">{currency(s.costCents)}</p>
                          </div>
                          <div>
                            <p className="text-stone-400 uppercase tracking-wide">Calls</p>
                            <p className="font-bold text-stone-900 text-sm">{s.calls}</p>
                          </div>
                          <div>
                            <p className="text-stone-400 uppercase tracking-wide">Latency</p>
                            <p className="font-bold text-stone-900 text-sm">{s.avgLatencyMs}ms</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] pt-1">
                          <span className="inline-flex items-center gap-0.5 text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" /> {s.acceptedCount} accept ({acceptRate}%)
                          </span>
                          {s.rejectedCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-stone-500">
                              <XCircle className="w-3 h-3" /> {s.rejectedCount} reject
                            </span>
                          )}
                          {s.erroredCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-red-600">
                              <AlertTriangle className="w-3 h-3" /> {s.erroredCount} err ({errorRate}%)
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* By model */}
          {data.byModel.length > 0 && (
            <section>
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-stone-500 px-1 mb-2">By model</h2>
              <Card padding="md">
                <div className="divide-y divide-stone-100">
                  {data.byModel.map((m) => (
                    <div key={m.modelVersionId} className="px-3 py-2.5 flex items-center gap-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-stone-900 truncate">{m.modelName}</p>
                        <p className="text-[10px] text-stone-400 font-mono">
                          {m.provider} · {m.modelId} · {m.promptVersion}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-stone-900">{currency(m.costCents)}</p>
                        <p className="text-[10px] text-stone-400">{m.calls} call{m.calls === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          )}

          {/* Daily trend */}
          {data.dailyTrend.length > 1 && (
            <section>
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-stone-500 px-1 mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" /> Daily spend ({data.dailyTrend.length} day{data.dailyTrend.length === 1 ? "" : "s"})
              </h2>
              <Card padding="md">
                <DailyChart days={data.dailyTrend} />
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────── KPI tile ─────────────── */

const ACCENTS: Record<string, { iconBg: string; iconText: string; gradient: string }> = {
  blue:    { iconBg: "bg-blue-50",    iconText: "text-blue-600",    gradient: "from-blue-500 to-cyan-500" },
  violet:  { iconBg: "bg-violet-50",  iconText: "text-violet-600",  gradient: "from-violet-500 to-fuchsia-500" },
  emerald: { iconBg: "bg-emerald-50", iconText: "text-emerald-600", gradient: "from-emerald-500 to-teal-500" },
};

function Kpi({ label, value, sub, icon, accent }: { label: string; value: string; sub?: string; icon: React.ReactNode; accent: keyof typeof ACCENTS }) {
  const a = ACCENTS[accent];
  return (
    <div className="bg-white rounded-2xl border-2 border-stone-200 overflow-hidden">
      <div className={cn("h-1 bg-gradient-to-r", a.gradient)} />
      <div className="p-4 flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", a.iconBg, a.iconText)}>
          {icon}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">{label}</p>
          <p className="text-xl font-bold text-stone-900 leading-tight mt-0.5">{value}</p>
          {sub && <p className="text-[10px] text-stone-400 font-medium leading-tight mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Tiny inline bar chart ─────────────── */

function DailyChart({ days }: { days: { date: string; calls: number; costCents: number }[] }) {
  const maxCost = Math.max(1, ...days.map((d) => d.costCents));
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1.5 min-w-fit pb-2" style={{ height: 120 }}>
        {days.map((d) => {
          const h = Math.round((d.costCents / maxCost) * 100);
          return (
            <div key={d.date} className="flex flex-col items-center gap-1" title={`${d.date}: ${(d.costCents / 100).toFixed(2)} · ${d.calls} calls`}>
              <div className="text-[8px] text-stone-400">{d.calls > 0 ? d.calls : ""}</div>
              <div
                className="w-3 rounded-t bg-gradient-to-t from-violet-500 to-pink-500 transition-all hover:opacity-80"
                style={{ height: `${Math.max(2, h)}%`, minHeight: 2 }}
              />
              <div className="text-[8px] text-stone-400 whitespace-nowrap">{d.date.slice(5)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
