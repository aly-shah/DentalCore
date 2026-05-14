"use client";

/**
 * DentaCore Interactive Odontogram
 *
 * Modern dental chart wired to the v2 endpoints:
 *   GET    /api/patients/[id]/dental-chart
 *   POST   /api/patients/[id]/dental-chart
 *   PUT    /api/dental-chart/[chartId]/teeth/[fdi]
 *   DELETE /api/dental-chart/[chartId]/teeth/[fdi]
 *
 * Features:
 *   - Adult + mixed-dentition + pediatric layouts
 *   - FDI / Universal numbering toggle
 *   - 14-status palette (HEALTHY, CARIES, FILLING, CROWN, BRIDGE,
 *     IMPLANT, MISSING, ROOT_CANAL, EXTRACTION_NEEDED, MOBILITY,
 *     FRACTURE, PROBLEM, UNDER_TREATMENT, TREATED)
 *   - Surface-level marking (M / D / O / B / L) with notes
 *   - Treatment planned vs completed
 *   - Priority (EMERGENCY / HIGH / MEDIUM / COSMETIC)
 *   - History timeline of tooth events
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Smile, X as XIcon, History, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/components/ui/loading";
import { cn } from "@/lib/utils";
import { AIFindingsPanel } from "./ai-findings-panel";
import {
  effectiveStatus,
  STATUS_STYLES,
  STATUSES,
  UNIVERSAL_MAP,
  type ToothStatus,
  type Surface,
  type SurfaceData,
  type ToothRecord,
} from "./dental-chart/types";
import { ToothPanel } from "./dental-chart/tooth-panel";
import { ToothSVG } from "./dental-chart/tooth-svg";
import { ArchView } from "./dental-chart/arch-view";
import { HistoryPanel, type ToothHistoryResponse } from "./dental-chart/history-panel";

// ───────── types ─────────

interface ChartResponse {
  chart: { id: string; numberingSystem: string; dentition: string } | null;
  teeth: ToothRecord[];
  numberingSystem: string;
  dentition: string;
}

// STATUS_STYLES, STATUSES, SURFACE_LABELS, surfaceFill all live in
// ./dental-chart/types so the tooth panel can share them without a
// circular import.

// ───────── numbering systems ─────────

const ADULT_UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const ADULT_UPPER_LEFT  = [21, 22, 23, 24, 25, 26, 27, 28];
const ADULT_LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const ADULT_LOWER_LEFT  = [31, 32, 33, 34, 35, 36, 37, 38];

const PRIMARY_UPPER_RIGHT = [55, 54, 53, 52, 51];
const PRIMARY_UPPER_LEFT  = [61, 62, 63, 64, 65];
const PRIMARY_LOWER_RIGHT = [85, 84, 83, 82, 81];
const PRIMARY_LOWER_LEFT  = [71, 72, 73, 74, 75];

// ───────── component ─────────

export default function DentalChartTabDefault(props: { patientId: string; onExit?: () => void }) {
  return <DentalChartTab {...props} />;
}

export function DentalChartTab({ patientId, onExit }: { patientId: string; onExit?: () => void }) {
  // onExit is accepted for compatibility with the fullscreen tab launcher
  // — its caller used to pass an exit handler to the previous chart. The
  // modern panel-based UX doesn't need a separate exit; ignore safely.
  void onExit;
  const qc = useQueryClient();
  const [numbering, setNumbering] = useState<"FDI" | "UNIVERSAL">("FDI");
  const [dentition, setDentition] = useState<"ADULT" | "MIXED" | "PEDIATRIC">("ADULT");
  const [viewMode, setViewMode] = useState<"ARCH" | "CLASSIC">("ARCH");
  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [quickMark, setQuickMark] = useState<ToothStatus | null>(null);
  /** "Copy mode" — the source tooth whose data will be applied to the next
   *  clicked teeth. Set by the "Apply to other teeth" button in the panel. */
  const [applyFromFdi, setApplyFromFdi] = useState<number | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);
  // Snapshot of the source tooth's data captured AT copy-mode entry so we
  // don't depend on a possibly-stale teethByFdi lookup after refetch.
  type ToothCopyPayload = {
    status: ToothStatus;
    priority: string;
    conditions: string;
    plannedTreatment: string;
    completedTreatment: string;
    surfaces: Partial<Record<Surface, SurfaceData>>;
  };
  const [applyFromData, setApplyFromData] = useState<ToothCopyPayload | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  const { data: chartRes, isLoading } = useQuery({
    queryKey: ["dental-chart", patientId],
    queryFn: async (): Promise<ChartResponse> => {
      const r = await fetch(`/api/patients/${patientId}/dental-chart`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to load chart");
      return j.data;
    },
  });

  const teethByFdi = useMemo(() => {
    const m: Record<number, ToothRecord> = {};
    for (const t of chartRes?.teeth ?? []) m[t.fdi] = t;
    return m;
  }, [chartRes]);

  const { data: history } = useQuery({
    queryKey: ["dental-chart-history", patientId],
    enabled: showHistory,
    queryFn: async (): Promise<ToothHistoryResponse> => {
      const r = await fetch(`/api/patients/${patientId}/dental-chart/history`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to load history");
      return j.data;
    },
  });

  const createChart = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/dental-chart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numberingSystem: numbering, dentition }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to create chart");
      return j.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dental-chart", patientId] }),
  });

  /** Quick-mark mutation — paints a status to the whole tooth without
   *  opening the panel. Used when the toolbar status is "loaded". */
  const quickMarkMutation = useMutation({
    mutationFn: async ({ fdi, status }: { fdi: number; status: ToothStatus }) => {
      if (!chartRes?.chart) return null;
      const r = await fetch(`/api/dental-chart/${chartRes.chart.id}/teeth/${fdi}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to mark tooth");
      return j.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dental-chart", patientId] }),
  });

  /** Apply mutation — copies all clinical fields from a source tooth onto
   *  the target tooth. Uses applyFromData snapshot, not the live cache,
   *  so it works even if React Query hasn't refetched the source yet. */
  const applyMutation = useMutation({
    mutationFn: async ({ toFdi }: { toFdi: number }) => {
      if (!chartRes?.chart) return null;
      if (!applyFromData) throw new Error("no source data");
      const body: Record<string, unknown> = {
        status: applyFromData.status,
        priority: applyFromData.priority,
        conditions: applyFromData.conditions || "",
        plannedTreatment: applyFromData.plannedTreatment || "",
        completedTreatment: applyFromData.completedTreatment || "",
      };
      // Only include `surfaces` if it's a non-empty object — the Zod
      // schema rejects null and an empty object is a no-op anyway.
      if (
        applyFromData.surfaces &&
        typeof applyFromData.surfaces === "object" &&
        Object.keys(applyFromData.surfaces).length > 0
      ) {
        body.surfaces = applyFromData.surfaces;
      }
      const r = await fetch(`/api/dental-chart/${chartRes.chart.id}/teeth/${toFdi}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to apply");
      return j.data;
    },
    onSuccess: () => {
      setAppliedCount((n) => n + 1);
      qc.invalidateQueries({ queryKey: ["dental-chart", patientId] });
    },
  });

  function fdiToDisplay(fdi: number): string {
    if (numbering === "UNIVERSAL") return UNIVERSAL_MAP[fdi] ?? String(fdi);
    return String(fdi);
  }

  const [initialSurface, setInitialSurface] = useState<Surface | null>(null);

  function Tooth({ fdi, arch }: { fdi: number; arch: "upper" | "lower" }) {
    const t = teethByFdi[fdi];
    const status = effectiveStatus(t);
    return (
      <ToothSVG
        fdi={fdi}
        arch={arch}
        status={status}
        surfaces={t?.surfaces ?? null}
        selected={selectedFdi === fdi}
        label={fdiToDisplay(fdi)}
        onClickTooth={() => {
          if (applyFromFdi !== null && applyFromFdi !== fdi && applyFromData) {
            applyMutation.mutate({ toFdi: fdi });
            return;
          }
          setInitialSurface(null);
          setSelectedFdi(fdi);
        }}
        onClickSurface={(surface) => {
          if (applyFromFdi !== null) return;
          setInitialSurface(surface);
          setSelectedFdi(fdi);
        }}
      />
    );
  }

  function ToothRow({ fdis, arch }: { fdis: number[]; arch: "upper" | "lower" }) {
    return (
      <div className={cn("flex gap-px", arch === "upper" ? "items-end" : "items-start")}>
        {fdis.map((fdi) => <Tooth key={fdi} fdi={fdi} arch={arch} />)}
      </div>
    );
  }

  const upperFdisLeft  = dentition === "MIXED" ? [...ADULT_UPPER_RIGHT, ...PRIMARY_UPPER_RIGHT]
                      : dentition === "PEDIATRIC" ? PRIMARY_UPPER_RIGHT : ADULT_UPPER_RIGHT;
  const upperFdisRight = dentition === "MIXED" ? [...PRIMARY_UPPER_LEFT, ...ADULT_UPPER_LEFT]
                      : dentition === "PEDIATRIC" ? PRIMARY_UPPER_LEFT : ADULT_UPPER_LEFT;
  const lowerFdisLeft  = dentition === "MIXED" ? [...ADULT_LOWER_RIGHT, ...PRIMARY_LOWER_RIGHT]
                      : dentition === "PEDIATRIC" ? PRIMARY_LOWER_RIGHT : ADULT_LOWER_RIGHT;
  const lowerFdisRight = dentition === "MIXED" ? [...PRIMARY_LOWER_LEFT, ...ADULT_LOWER_LEFT]
                      : dentition === "PEDIATRIC" ? PRIMARY_LOWER_LEFT : ADULT_LOWER_LEFT;

  return (
    <div className="space-y-4">
      {/* Inline keyframes for chip/tab/drawer micro-animations */}
      <style>{`
        @keyframes chipPop {
          0% { transform: scale(0.7) translateY(-2px); opacity: 0; }
          60% { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeSlideUp {
          0% { transform: translateY(8px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smile className="w-5 h-5 text-blue-500" />
          <h2 className="text-base font-semibold text-stone-900">Dental Chart</h2>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* View mode */}
          <div className="inline-flex bg-stone-100 rounded-lg p-0.5">
            {(["ARCH", "CLASSIC"] as const).map((v) => (
              <button key={v} onClick={() => setViewMode(v)} className={cn(
                "px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all",
                viewMode === v ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
              )}>{v === "ARCH" ? "Arch" : "Classic"}</button>
            ))}
          </div>
          <div className="inline-flex bg-stone-100 rounded-lg p-0.5">
            {(["FDI", "UNIVERSAL"] as const).map((n) => (
              <button key={n} onClick={() => setNumbering(n)} className={cn(
                "px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all",
                numbering === n ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
              )}>{n}</button>
            ))}
          </div>
          <div className="inline-flex bg-stone-100 rounded-lg p-0.5">
            {(["ADULT", "MIXED", "PEDIATRIC"] as const).map((d) => (
              <button key={d} onClick={() => setDentition(d)} className={cn(
                "px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all",
                dentition === d ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"
              )}>{d.charAt(0) + d.slice(1).toLowerCase()}</button>
            ))}
          </div>
          <Button size="sm" variant="outline" iconLeft={<History className="w-3.5 h-3.5" />} onClick={() => setShowHistory((v) => !v)}>
            History
          </Button>
          {chartRes?.chart && (
            <button
              onClick={() => setAiPanelOpen(true)}
              className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 hover:shadow-md transition-all hover:-translate-y-px shadow-sm"
              title="Analyze chart with AI"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Analyze
            </button>
          )}
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-8"><LoadingSpinner size="md" /></div>}

      {!isLoading && !chartRes?.chart && (
        <div className="rounded-xl border-2 border-dashed border-stone-200 p-6 text-center space-y-3">
          <p className="text-sm text-stone-500">No active dental chart yet for this patient.</p>
          <Button size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />} onClick={() => createChart.mutate()} disabled={createChart.isPending}>
            {createChart.isPending ? "Creating…" : "Create dental chart"}
          </Button>
        </div>
      )}

      {/* Apply-to-other-teeth banner — sticky at top of the chart area
          so it's always visible while in copy mode (both Arch + Classic views). */}
      {applyFromFdi !== null && (
        <div className="sticky top-2 z-20 rounded-xl border-2 border-violet-400 bg-gradient-to-r from-violet-100 to-fuchsia-100 px-3 py-2.5 flex items-center gap-3 shadow-lg animate-fade-in">
          <div className="w-9 h-9 rounded-lg bg-violet-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-md">
            #{applyFromFdi}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-violet-900 leading-tight flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              Copy mode active — source tooth #{applyFromFdi}
            </p>
            <p className="text-[10px] text-violet-700 leading-tight mt-0.5">
              {appliedCount > 0
                ? `Applied to ${appliedCount} other tooth${appliedCount === 1 ? "" : "es"}. Click more teeth to keep painting.`
                : "Click any tooth to paste its status, conditions, surfaces & treatments."}
            </p>
          </div>
          <button
            onClick={() => { setApplyFromFdi(null); setApplyFromData(null); setAppliedCount(0); }}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white text-violet-700 hover:bg-violet-50 border border-violet-300 transition-colors shrink-0 shadow-sm"
          >
            Done
          </button>
        </div>
      )}

      {!isLoading && chartRes?.chart && viewMode === "ARCH" && (
        <>
          {/* Quick-mark toolbar */}
          <div className="rounded-xl border border-stone-200 bg-white p-2 flex items-center gap-2 overflow-x-auto">
            <span className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold shrink-0 px-1">
              Quick mark
            </span>
            <div className="flex gap-1 flex-wrap">
              {STATUSES.filter((s) => s !== "HEALTHY" && s !== "PROBLEM" && s !== "UNDER_TREATMENT" && s !== "TREATED").map((s) => (
                <button
                  key={s}
                  onClick={() => setQuickMark(quickMark === s ? null : s)}
                  className={cn(
                    "px-2 py-1 rounded-md text-[10px] font-semibold border-2 transition-all flex items-center gap-1.5",
                    quickMark === s
                      ? `${STATUS_STYLES[s].border} ${STATUS_STYLES[s].bg} ${STATUS_STYLES[s].text} scale-105 shadow-sm`
                      : "border-transparent text-stone-500 hover:border-stone-200 hover:bg-stone-50"
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_STYLES[s].dot)} />
                  {STATUS_STYLES[s].label}
                </button>
              ))}
            </div>
            {quickMark && (
              <button
                onClick={() => setQuickMark(null)}
                className="ml-auto text-[10px] text-stone-400 hover:text-stone-700 px-2 py-1 shrink-0"
                title="Clear quick mark"
              >
                Clear ✕
              </button>
            )}
          </div>
          {quickMark && (
            <div className="text-[10px] text-stone-500 -mt-2 px-1">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse mr-1.5" />
              Click any tooth to mark it as <strong>{STATUS_STYLES[quickMark].label}</strong> · surface clicks disabled while marking
            </div>
          )}

          <div className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4 overflow-x-auto shadow-sm">
            <ArchView
              dentition={dentition}
              teethByFdi={teethByFdi}
              selectedFdi={selectedFdi}
              numbering={numbering}
              quickMark={quickMark}
              onQuickMark={(fdi, status) => quickMarkMutation.mutate({ fdi, status })}
              onClickTooth={(fdi) => {
                if (applyFromFdi !== null && applyFromFdi !== fdi && applyFromData) {
                  // Copy-mode: paint source's data onto this tooth.
                  applyMutation.mutate({ toFdi: fdi });
                  return;
                }
                setInitialSurface(null);
                setSelectedFdi(fdi);
              }}
              onClickSurface={(fdi, s) => {
                if (applyFromFdi !== null) return; // ignore surface clicks in copy-mode
                setInitialSurface(s);
                setSelectedFdi(fdi);
              }}
            />
          </div>

          {/* Status summary ribbon — counts of teeth per status */}
          {(() => {
            const counts: Partial<Record<ToothStatus, number>> = {};
            for (const t of Object.values(teethByFdi)) {
              // Use the effective (derived) status so teeth with only
              // surface data / conditions are also counted.
              const es = effectiveStatus(t);
              counts[es] = (counts[es] || 0) + 1;
            }
            const totalIssues = Object.entries(counts).reduce((a, [s, n]) => a + (s !== "HEALTHY" ? (n || 0) : 0), 0);
            // Multi-issue teeth: teeth with derived non-healthy status AND ≥1 surface issue
            const multiIssueCount = Object.values(teethByFdi).filter((t) => {
              const surfCount = t.surfaces ? Object.values(t.surfaces).filter((d) => !!(d?.condition || d?.completedTreatment || d?.plannedTreatment)).length : 0;
              const es = effectiveStatus(t);
              return surfCount >= 2 || (surfCount >= 1 && es !== "HEALTHY");
            }).length;
            return (
              <div className="rounded-xl bg-white border border-stone-200 px-3 py-2.5 flex items-center gap-3 overflow-x-auto">
                <div className="flex items-center gap-2 shrink-0 pr-3 border-r border-stone-100">
                  <div className="flex flex-col">
                    <span className="text-lg font-bold text-stone-900 leading-none">{totalIssues}</span>
                    <span className="text-[9px] uppercase tracking-wider text-stone-400 font-semibold">Flagged</span>
                  </div>
                  {multiIssueCount > 0 && (
                    <div className="flex flex-col">
                      <span className="text-lg font-bold text-amber-600 leading-none">{multiIssueCount}</span>
                      <span className="text-[9px] uppercase tracking-wider text-amber-500 font-semibold">Multi-issue</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(Object.entries(counts) as Array<[ToothStatus, number]>)
                    .filter(([s, n]) => s !== "HEALTHY" && (n ?? 0) > 0)
                    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                    .map(([s, n]) => (
                      <div key={s} className="inline-flex items-center gap-1 text-[10px]">
                        <span className={cn("w-2 h-2 rounded-full", STATUS_STYLES[s].dot)} />
                        <span className="font-semibold text-stone-700">{n}</span>
                        <span className="text-stone-500">{STATUS_STYLES[s].label}</span>
                      </div>
                    ))}
                  {totalIssues === 0 && (
                    <span className="text-[11px] text-emerald-600 font-medium">All teeth healthy ✓</span>
                  )}
                </div>
              </div>
            );
          })()}
        </>
      )}

      {!isLoading && chartRes?.chart && viewMode === "CLASSIC" && (
        <>
          <div className="rounded-xl border border-stone-200 bg-stone-50/40 p-3 sm:p-4">
            <div className="w-full mx-auto">
              {/* UPPER label */}
              <div className="text-center text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1.5">
                UPPER
              </div>

              {/* Upper arch — side view on top, occlusal on bottom */}
              <div className="flex justify-center items-end gap-1.5 pt-2">
                <div className="flex items-end">
                  <ToothRow fdis={upperFdisLeft} arch="upper" />
                </div>
                <div className="w-px self-stretch border-l border-dashed border-stone-300" />
                <div className="flex items-end">
                  <ToothRow fdis={upperFdisRight} arch="upper" />
                </div>
              </div>

              {/* Center horizontal divider with RIGHT / LINGUAL / LEFT labels */}
              <div className="flex items-center justify-between gap-2 sm:gap-3 my-1.5 sm:my-2 px-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">RIGHT</span>
                <div className="flex-1 h-px bg-stone-300" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">LINGUAL</span>
                <div className="flex-1 h-px bg-stone-300" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">LEFT</span>
              </div>

              {/* Lower arch — occlusal on top, side view on bottom */}
              <div className="flex justify-center items-start gap-1.5 pb-2">
                <div className="flex items-start">
                  <ToothRow fdis={lowerFdisLeft} arch="lower" />
                </div>
                <div className="w-px self-stretch border-l border-dashed border-stone-300" />
                <div className="flex items-start">
                  <ToothRow fdis={lowerFdisRight} arch="lower" />
                </div>
              </div>

              {/* LOWER label */}
              <div className="text-center text-[10px] font-bold uppercase tracking-widest text-stone-500 mt-1.5">
                LOWER
              </div>
            </div>
          </div>

          <details className="text-[10px] text-stone-500">
            <summary className="cursor-pointer select-none">Status legend</summary>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
              {STATUSES.map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={cn("w-3 h-3 rounded-full", STATUS_STYLES[s].dot)} />
                  <span>{STATUS_STYLES[s].label}</span>
                </div>
              ))}
            </div>
          </details>
        </>
      )}

      {selectedFdi !== null && chartRes?.chart && (
        <ToothPanel
          chartId={chartRes.chart.id}
          fdi={selectedFdi}
          existing={teethByFdi[selectedFdi]}
          initialSurface={initialSurface}
          patientId={patientId}
          onClose={() => { setSelectedFdi(null); setInitialSurface(null); }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["dental-chart", patientId] })}
          onApplyToOthers={(sourceFdi, payload) => {
            setSelectedFdi(null);
            setInitialSurface(null);
            setAppliedCount(0);
            setApplyFromFdi(sourceFdi);
            setApplyFromData(payload);
          }}
        />
      )}

      {showHistory && (
        <HistoryPanel history={history} onClose={() => setShowHistory(false)} />
      )}

      {aiPanelOpen && chartRes?.chart && (
        <AIFindingsPanel
          patientId={patientId}
          chartId={chartRes.chart.id}
          onClose={() => setAiPanelOpen(false)}
        />
      )}
    </div>
  );
}

