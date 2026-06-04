"use client";

/**
 * Doctor App — compact, read-first dental chart for the patient summary.
 *
 * Mobile-tuned mini version of the full DentalChartTab: two scrollable
 * arches of teeth coloured by status, a legend, and a tap-to-inspect
 * detail card. Supports adult, pediatric (primary) and mixed dentition so
 * it works for child patients too. Works in both live mode (fetches the
 * patient's chart) and demo mode (mock data, zero API calls).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Smile, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STATUS_STYLES,
  UNIVERSAL_MAP,
  effectiveStatus,
  toothCategory,
  parseChips,
  type ToothStatus,
  type ToothRecord,
} from "@/components/patients/tabs/dental-chart/types";
import { demoChart } from "./demo-data";

/** Loose tooth shape accepted from either the live API or demo data. */
interface ChartTooth {
  fdi: number;
  status?: ToothStatus | string | null;
  conditions?: string | null;
  plannedTreatment?: string | null;
  completedTreatment?: string | null;
  priority?: string | null;
  surfaces?: ToothRecord["surfaces"];
}

type Dentition = "ADULT" | "PEDIATRIC" | "MIXED";

// FDI layout, presented in the conventional chart orientation
// (patient's right on the left of the page).
const PERM_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const PERM_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const PRIM_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const PRIM_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

const CATEGORY_LABEL: Record<ReturnType<typeof toothCategory>, string> = {
  incisor: "Incisor",
  canine: "Canine",
  premolar: "Premolar",
  molar: "Molar",
};

function displayStatus(t: ChartTooth | undefined): ToothStatus {
  if (!t) return "HEALTHY";
  // Reuse the same resolution the full chart uses so colours match.
  return effectiveStatus({
    status: (t.status as ToothStatus) ?? "HEALTHY",
    conditions: t.conditions ?? null,
    plannedTreatment: t.plannedTreatment ?? null,
    completedTreatment: t.completedTreatment ?? null,
    surfaces: t.surfaces ?? null,
  } as ToothRecord);
}

export function DentalChartMini({ patientId, demo = false }: { patientId: string; demo?: boolean }) {
  const [numbering, setNumbering] = useState<"FDI" | "UNIVERSAL">("FDI");
  const [sel, setSel] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ["doctor-chart", patientId],
    enabled: !demo,
    queryFn: async (): Promise<{ dentition: Dentition; teeth: ChartTooth[] }> => {
      const r = await fetch(`/api/patients/${patientId}/dental-chart`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to load chart");
      return { dentition: (j.data.dentition as Dentition) ?? "ADULT", teeth: (j.data.teeth ?? []) as ChartTooth[] };
    },
  });

  const data = demo ? demoChart(patientId) : query.data;
  const isLoading = !demo && query.isLoading;
  const teeth = data?.teeth ?? [];
  const dentition: Dentition = data?.dentition ?? "ADULT";

  const byFdi = new Map<number, ChartTooth>();
  for (const t of teeth) byFdi.set(t.fdi, t);

  const showPrimary = dentition === "PEDIATRIC" || dentition === "MIXED";
  const showPermanent = dentition === "ADULT" || dentition === "MIXED";

  // Legend — only the non-healthy statuses actually present on this chart.
  const presentStatuses = Array.from(
    new Set(teeth.map((t) => displayStatus(t)).filter((s) => s !== "HEALTHY")),
  );

  const selTooth = sel != null ? byFdi.get(sel) : undefined;
  const selStatus = sel != null ? displayStatus(selTooth) : "HEALTHY";
  const selLabel = sel != null && numbering === "UNIVERSAL" ? UNIVERSAL_MAP[sel] ?? sel : sel;

  return (
    <section className="rounded-2xl bg-white border border-stone-200 p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5">
          <Smile className="w-3.5 h-3.5 text-teal-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600">Dental Chart</span>
          {dentition !== "ADULT" && (
            <span className="text-[9px] font-semibold text-teal-700 bg-teal-50 rounded-full px-1.5 py-0.5">
              {dentition === "PEDIATRIC" ? "Primary" : "Mixed"}
            </span>
          )}
        </div>
        <div className="flex rounded-lg border border-stone-200 overflow-hidden" role="group" aria-label="Tooth numbering system">
          {(["FDI", "UNIVERSAL"] as const).map((n) => (
            <button
              key={n}
              onClick={() => setNumbering(n)}
              aria-pressed={numbering === n}
              className={cn(
                "px-2 py-0.5 text-[9px] font-bold transition-colors",
                numbering === n ? "bg-teal-600 text-white" : "bg-white text-stone-400",
              )}
            >
              {n === "FDI" ? "FDI" : "US"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : teeth.length === 0 ? (
        <p className="text-[11px] text-stone-400 text-center py-4">No findings charted yet — all teeth healthy.</p>
      ) : (
        <>
          <div className="space-y-2">
            {showPermanent && (
              <>
                <ArchRow fdis={PERM_UPPER} split={8} byFdi={byFdi} numbering={numbering} sel={sel} onSel={setSel} />
                <ArchRow fdis={PERM_LOWER} split={8} byFdi={byFdi} numbering={numbering} sel={sel} onSel={setSel} />
              </>
            )}
            {showPrimary && (
              <>
                {showPermanent && <div className="h-px bg-stone-100 my-1" />}
                <ArchRow fdis={PRIM_UPPER} split={5} byFdi={byFdi} numbering={numbering} sel={sel} onSel={setSel} />
                <ArchRow fdis={PRIM_LOWER} split={5} byFdi={byFdi} numbering={numbering} sel={sel} onSel={setSel} />
              </>
            )}
          </div>

          {/* Legend */}
          {presentStatuses.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-2 border-t border-stone-100">
              {presentStatuses.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 text-[9px] text-stone-500">
                  <span className={cn("w-2 h-2 rounded-full", STATUS_STYLES[s].dot)} />
                  {STATUS_STYLES[s].label}
                </span>
              ))}
            </div>
          )}

          {/* Selected tooth detail */}
          {sel != null && (
            <div className={cn("mt-3 rounded-xl border p-2.5", STATUS_STYLES[selStatus].bg, STATUS_STYLES[selStatus].border)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-stone-900">Tooth {selLabel}</span>
                  <span className="text-[10px] text-stone-500">{CATEGORY_LABEL[toothCategory(sel)]}</span>
                </div>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", STATUS_STYLES[selStatus].text, "bg-white/70")}>
                  {STATUS_STYLES[selStatus].label}
                </span>
              </div>
              {selTooth ? (
                <div className="mt-1.5 space-y-1">
                  {parseChips(selTooth.conditions).length > 0 && (
                    <DetailRow label="Findings" value={parseChips(selTooth.conditions).join(", ")} />
                  )}
                  {selTooth.plannedTreatment && <DetailRow label="Planned" value={selTooth.plannedTreatment} />}
                  {selTooth.completedTreatment && <DetailRow label="Done" value={selTooth.completedTreatment} />}
                  {selTooth.priority && selTooth.priority !== "MEDIUM" && (
                    <DetailRow label="Priority" value={String(selTooth.priority).toLowerCase()} />
                  )}
                  {!selTooth.conditions && !selTooth.plannedTreatment && !selTooth.completedTreatment && (
                    <p className="text-[11px] text-stone-500">No further notes recorded.</p>
                  )}
                </div>
              ) : (
                <p className="mt-1.5 text-[11px] text-stone-500">Healthy — no findings recorded.</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ArchRow({
  fdis,
  split,
  byFdi,
  numbering,
  sel,
  onSel,
}: {
  fdis: number[];
  split: number;
  byFdi: Map<number, ChartTooth>;
  numbering: "FDI" | "UNIVERSAL";
  sel: number | null;
  onSel: (fdi: number) => void;
}) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex items-stretch gap-0.5 w-max mx-auto">
        {fdis.map((fdi, i) => (
          <span key={fdi} className="flex items-stretch gap-0.5">
            {i === split && <span className="w-px bg-stone-200 mx-0.5 self-stretch" aria-hidden />}
            <ToothCell fdi={fdi} tooth={byFdi.get(fdi)} numbering={numbering} selected={sel === fdi} onSel={onSel} />
          </span>
        ))}
      </div>
    </div>
  );
}

function ToothCell({
  fdi,
  tooth,
  numbering,
  selected,
  onSel,
}: {
  fdi: number;
  tooth: ChartTooth | undefined;
  numbering: "FDI" | "UNIVERSAL";
  selected: boolean;
  onSel: (fdi: number) => void;
}) {
  const st = displayStatus(tooth);
  const style = STATUS_STYLES[st];
  const label = numbering === "UNIVERSAL" ? UNIVERSAL_MAP[fdi] ?? fdi : fdi;
  const missing = st === "MISSING";
  return (
    <button
      type="button"
      onClick={() => onSel(fdi)}
      aria-label={`Tooth ${label}${st !== "HEALTHY" ? `, ${style.label}` : ", healthy"}`}
      aria-pressed={selected}
      className={cn(
        "shrink-0 w-8 min-h-[2.75rem] rounded-md border flex flex-col items-center justify-between py-1 transition-shadow",
        style.bg,
        style.border,
        selected && "ring-2 ring-teal-500 ring-offset-1",
      )}
    >
      <span className="text-[8px] font-mono text-stone-400 leading-none">{label}</span>
      {missing ? (
        <span className="text-stone-400 text-[11px] leading-none mb-0.5" aria-hidden>×</span>
      ) : (
        <span className={cn("w-2.5 h-2.5 rounded-full mb-0.5", style.dot)} aria-hidden />
      )}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[11px] leading-snug text-stone-700">
      <span className="text-stone-400 font-bold uppercase tracking-wide mr-1 text-[9px]">{label}</span>
      <span>{value}</span>
    </p>
  );
}
