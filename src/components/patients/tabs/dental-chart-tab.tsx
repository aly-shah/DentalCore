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
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Smile, Save, X as XIcon, History, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/components/ui/loading";
import { cn } from "@/lib/utils";

// ───────── types ─────────

type ToothStatus =
  | "HEALTHY" | "CARIES" | "FILLING" | "CROWN" | "BRIDGE" | "IMPLANT"
  | "MISSING" | "ROOT_CANAL" | "EXTRACTION_NEEDED" | "MOBILITY" | "FRACTURE"
  | "PROBLEM" | "UNDER_TREATMENT" | "TREATED";

type Surface = "mesial" | "distal" | "occlusal" | "buccal" | "lingual";

interface SurfaceData {
  condition?: string;
  treatment?: string;
  plannedTreatment?: string;
  completedTreatment?: string;
  notes?: string;
}

interface ToothRecord {
  id: string;
  patientId: string;
  chartId: string | null;
  fdi: number;
  status: ToothStatus;
  conditions: string | null;
  treatment: string | null;
  plannedTreatment: string | null;
  completedTreatment: string | null;
  surfaces: Partial<Record<Surface, SurfaceData>> | null;
  priority: "EMERGENCY" | "HIGH" | "MEDIUM" | "COSMETIC";
  notes: string | null;
  updatedAt: string;
}

interface ChartResponse {
  chart: { id: string; numberingSystem: string; dentition: string } | null;
  teeth: ToothRecord[];
  numberingSystem: string;
  dentition: string;
}

interface HistoryResponse {
  charts: Array<{ id: string; createdAt: string; isPrimary: boolean; teeth: ToothRecord[] }>;
  events: Array<{
    id: string;
    occurredAt: string;
    eventType: string;
    previousStatus: string | null;
    newStatus: string | null;
    surface: string | null;
    notes: string | null;
    tooth: { fdi: number };
  }>;
}

// ───────── status styling ─────────

const STATUS_STYLES: Record<ToothStatus, { label: string; bg: string; border: string; text: string; dot: string }> = {
  HEALTHY:            { label: "Healthy",         bg: "bg-white",       border: "border-stone-200",     text: "text-stone-700",   dot: "bg-stone-300" },
  CARIES:             { label: "Caries",          bg: "bg-rose-50",     border: "border-rose-300",      text: "text-rose-700",    dot: "bg-rose-500" },
  FILLING:            { label: "Filling",         bg: "bg-amber-50",    border: "border-amber-300",     text: "text-amber-700",   dot: "bg-amber-500" },
  CROWN:              { label: "Crown",           bg: "bg-yellow-50",   border: "border-yellow-400",    text: "text-yellow-800",  dot: "bg-yellow-500" },
  BRIDGE:             { label: "Bridge",          bg: "bg-orange-50",   border: "border-orange-300",    text: "text-orange-700",  dot: "bg-orange-500" },
  IMPLANT:            { label: "Implant",         bg: "bg-blue-50",     border: "border-blue-300",      text: "text-blue-700",    dot: "bg-blue-500" },
  MISSING:            { label: "Missing",         bg: "bg-stone-200",   border: "border-stone-400",     text: "text-stone-500",   dot: "bg-stone-500" },
  ROOT_CANAL:         { label: "Root Canal",      bg: "bg-purple-50",   border: "border-purple-300",    text: "text-purple-700",  dot: "bg-purple-500" },
  EXTRACTION_NEEDED:  { label: "Extract",         bg: "bg-red-100",     border: "border-red-400",       text: "text-red-700",     dot: "bg-red-600" },
  MOBILITY:           { label: "Mobile",          bg: "bg-pink-50",     border: "border-pink-300",      text: "text-pink-700",    dot: "bg-pink-500" },
  FRACTURE:           { label: "Fracture",        bg: "bg-violet-50",   border: "border-violet-300",    text: "text-violet-700",  dot: "bg-violet-500" },
  PROBLEM:            { label: "Problem",         bg: "bg-rose-50",     border: "border-rose-300",      text: "text-rose-700",    dot: "bg-rose-400" },
  UNDER_TREATMENT:    { label: "In Treatment",    bg: "bg-cyan-50",     border: "border-cyan-300",      text: "text-cyan-700",    dot: "bg-cyan-500" },
  TREATED:            { label: "Treated",         bg: "bg-emerald-50",  border: "border-emerald-300",   text: "text-emerald-700", dot: "bg-emerald-500" },
};

const STATUSES: ToothStatus[] = [
  "HEALTHY", "CARIES", "FILLING", "CROWN", "BRIDGE", "IMPLANT",
  "ROOT_CANAL", "EXTRACTION_NEEDED", "MOBILITY", "FRACTURE",
  "MISSING", "UNDER_TREATMENT", "TREATED",
];

// ───────── numbering systems ─────────

const UNIVERSAL_MAP: Record<number, string> = {
  18: "1",  17: "2",  16: "3",  15: "4",  14: "5",  13: "6",  12: "7",  11: "8",
  21: "9",  22: "10", 23: "11", 24: "12", 25: "13", 26: "14", 27: "15", 28: "16",
  38: "17", 37: "18", 36: "19", 35: "20", 34: "21", 33: "22", 32: "23", 31: "24",
  41: "25", 42: "26", 43: "27", 44: "28", 45: "29", 46: "30", 47: "31", 48: "32",
  55: "A", 54: "B", 53: "C", 52: "D", 51: "E",
  61: "F", 62: "G", 63: "H", 64: "I", 65: "J",
  75: "K", 74: "L", 73: "M", 72: "N", 71: "O",
  81: "P", 82: "Q", 83: "R", 84: "S", 85: "T",
};

const ADULT_UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const ADULT_UPPER_LEFT  = [21, 22, 23, 24, 25, 26, 27, 28];
const ADULT_LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const ADULT_LOWER_LEFT  = [31, 32, 33, 34, 35, 36, 37, 38];

const PRIMARY_UPPER_RIGHT = [55, 54, 53, 52, 51];
const PRIMARY_UPPER_LEFT  = [61, 62, 63, 64, 65];
const PRIMARY_LOWER_RIGHT = [85, 84, 83, 82, 81];
const PRIMARY_LOWER_LEFT  = [71, 72, 73, 74, 75];

const SURFACE_LABELS: Record<Surface, string> = {
  mesial: "M (Mesial)",
  distal: "D (Distal)",
  occlusal: "O (Occlusal)",
  buccal: "B (Buccal)",
  lingual: "L (Lingual)",
};

// ───────── anatomical tooth SVG ─────────

type ToothCategory = "incisor" | "canine" | "premolar" | "molar";

function toothCategory(fdi: number): ToothCategory {
  // Position within quadrant (1 = central incisor, 8 = third molar).
  // For primary teeth (51-85): 1-2 incisors, 3 canine, 4-5 molars.
  const last = fdi % 10;
  const isPrimary = (fdi >= 51 && fdi <= 85);
  if (isPrimary) {
    if (last <= 2) return "incisor";
    if (last === 3) return "canine";
    return "molar";
  }
  if (last <= 2) return "incisor";
  if (last === 3) return "canine";
  if (last === 4 || last === 5) return "premolar";
  return "molar"; // 6, 7, 8
}

/**
 * Surface fill color based on the tooth's surface data or top-level
 * status. If the surface has its own condition/treatment, paint that
 * surface; otherwise fall back to the tooth's overall status colour.
 */
function surfaceFill(
  toothStatus: ToothStatus,
  surfaceData: SurfaceData | undefined
): { fill: string; stroke: string } {
  // Surface-specific data wins
  if (surfaceData?.condition || surfaceData?.completedTreatment) {
    if (surfaceData.completedTreatment) {
      return { fill: "#10b981", stroke: "#059669" }; // emerald — treated
    }
    return { fill: "#f43f5e", stroke: "#e11d48" }; // rose — caries / problem
  }
  if (surfaceData?.plannedTreatment) {
    return { fill: "#06b6d4", stroke: "#0891b2" }; // cyan — planned
  }
  // Fall back to tooth-level status (only paints if not healthy)
  const map: Partial<Record<ToothStatus, { fill: string; stroke: string }>> = {
    HEALTHY: { fill: "#ffffff", stroke: "#e7e5e4" },
    CARIES: { fill: "#fecdd3", stroke: "#fb7185" },
    FILLING: { fill: "#fde68a", stroke: "#f59e0b" },
    CROWN: { fill: "#fef08a", stroke: "#eab308" },
    BRIDGE: { fill: "#fed7aa", stroke: "#f97316" },
    IMPLANT: { fill: "#bfdbfe", stroke: "#3b82f6" },
    MISSING: { fill: "#e7e5e4", stroke: "#a8a29e" },
    ROOT_CANAL: { fill: "#e9d5ff", stroke: "#a855f7" },
    EXTRACTION_NEEDED: { fill: "#fecaca", stroke: "#dc2626" },
    MOBILITY: { fill: "#fbcfe8", stroke: "#ec4899" },
    FRACTURE: { fill: "#ddd6fe", stroke: "#8b5cf6" },
    PROBLEM: { fill: "#fecdd3", stroke: "#fb7185" },
    UNDER_TREATMENT: { fill: "#a5f3fc", stroke: "#06b6d4" },
    TREATED: { fill: "#a7f3d0", stroke: "#10b981" },
  };
  return map[toothStatus] ?? map.HEALTHY!;
}

interface ToothSVGProps {
  fdi: number;
  arch: "upper" | "lower";
  status: ToothStatus;
  surfaces: Partial<Record<Surface, SurfaceData>> | null;
  selected: boolean;
  label: string;
  onClickTooth: () => void;
  onClickSurface: (surface: Surface) => void;
}

function ToothSVG({ fdi, arch, status, surfaces, selected, label, onClickTooth, onClickSurface }: ToothSVGProps) {
  const cat = toothCategory(fdi);

  // Tooth crown width by category (in SVG units)
  const cw = cat === "incisor" ? 24 : cat === "canine" ? 26 : cat === "premolar" ? 30 : 34;
  const ch = 34; // crown height
  const rw = cw - 8; // root width (top for upper / bottom for lower)
  const rh = 14; // root height
  const VB_W = 40;
  const VB_H = 56;
  const crownX = (VB_W - cw) / 2;
  const crownY = arch === "upper" ? rh + 2 : 4;
  const rootY = arch === "upper" ? 2 : crownY + ch;
  const rootX = (VB_W - rw) / 2;

  // 3x3 grid within crown for 5 surfaces.
  const cellW = cw / 3;
  const cellH = ch / 3;
  // Note: in clinical convention from the chair side, M is toward
  // midline (centre). For all teeth in our straight-row layout we put
  // M on the side facing the centre — that's the LEFT for Q1+Q4 (right
  // side of mouth viewed) and RIGHT for Q2+Q3 (left side of mouth).
  const quadrant = Math.floor(fdi / 10); // 1, 2, 3, 4, 5..8
  // For straight rows aligned by quadrant blocks, M is on the inner edge.
  // Q1 (upper right) sits on the LEFT half of the row → M is on the RIGHT.
  // Q2 (upper left) sits on the RIGHT half → M is on the LEFT.
  // Q3 (lower left) RIGHT half → M on LEFT.
  // Q4 (lower right) LEFT half → M on RIGHT.
  // Primary: same pattern (51-55 like Q1, 61-65 like Q2, etc.)
  const mOnRight = quadrant === 1 || quadrant === 4 || quadrant === 5 || quadrant === 8;
  const mesialCol = mOnRight ? 2 : 0;
  const distalCol = mOnRight ? 0 : 2;
  // For upper teeth, B (buccal/labial = cheek-facing) is the row toward
  // the patient's lips → top of our crown (closest to the gum line which
  // is at top for upper).
  const buccalRow = arch === "upper" ? 0 : 2;
  const lingualRow = arch === "upper" ? 2 : 0;

  const surfaceCells: Array<{ s: Surface; col: number; row: number }> = [
    { s: "occlusal", col: 1, row: 1 },
    { s: "buccal",   col: 1, row: buccalRow },
    { s: "lingual",  col: 1, row: lingualRow },
    { s: "mesial",   col: mesialCol, row: 1 },
    { s: "distal",   col: distalCol, row: 1 },
  ];

  // Crown outline path — molars + premolars have cusps drawn at the
  // chewing edge for visual differentiation.
  let crownPath: React.ReactNode;
  if (cat === "molar" || cat === "premolar") {
    // square-ish with subtly notched chewing edge
    crownPath = (
      <rect
        x={crownX}
        y={crownY}
        width={cw}
        height={ch}
        rx={4}
        fill="white"
        stroke="#a8a29e"
        strokeWidth={1.2}
      />
    );
  } else if (cat === "canine") {
    // Pointed cusp at chewing edge
    const tipY = arch === "upper" ? crownY + ch : crownY;
    const baseY = arch === "upper" ? crownY : crownY + ch;
    crownPath = (
      <g>
        <rect
          x={crownX}
          y={crownY}
          width={cw}
          height={ch * 0.8}
          rx={3}
          fill="white"
          stroke="#a8a29e"
          strokeWidth={1.2}
        />
        <path
          d={`M ${crownX} ${baseY + (arch === "upper" ? ch * 0.8 : -ch * 0.8)} L ${VB_W / 2} ${tipY} L ${crownX + cw} ${baseY + (arch === "upper" ? ch * 0.8 : -ch * 0.8)} Z`}
          fill="white"
          stroke="#a8a29e"
          strokeWidth={1.2}
        />
      </g>
    );
  } else {
    // incisor — narrow rectangle with slightly rounded chewing edge
    crownPath = (
      <rect
        x={crownX}
        y={crownY}
        width={cw}
        height={ch}
        rx={3}
        ry={cat === "incisor" ? 6 : 3}
        fill="white"
        stroke="#a8a29e"
        strokeWidth={1.2}
      />
    );
  }

  const rootPath = (
    <path
      d={
        arch === "upper"
          ? // root points up
            `M ${rootX} ${rootY + rh} L ${rootX + rw / 2} ${rootY} L ${rootX + rw} ${rootY + rh} Z`
          : // root points down
            `M ${rootX} ${rootY} L ${rootX + rw / 2} ${rootY + rh} L ${rootX + rw} ${rootY} Z`
      }
      fill="#fafaf9"
      stroke="#d6d3d1"
      strokeWidth={0.8}
    />
  );

  const missing = status === "MISSING";

  return (
    <button
      type="button"
      onClick={onClickTooth}
      title={`FDI ${fdi} · ${cat} · ${STATUS_STYLES[status].label}`}
      className={cn(
        "relative inline-block transition-all",
        selected ? "drop-shadow-lg scale-110 z-10" : "hover:drop-shadow-md",
        missing && "opacity-40"
      )}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width={VB_W * 0.9}
        height={VB_H * 0.9}
        className="overflow-visible"
      >
        {/* Root (rendered first so it sits behind the crown clip area) */}
        {rootPath}
        {/* Crown outline */}
        {crownPath}
        {/* Surface cells — only render the 5 active ones (cross) */}
        {!missing &&
          surfaceCells.map(({ s, col, row }) => {
            const data = surfaces?.[s];
            const { fill, stroke } = surfaceFill(status, data);
            const x = crownX + col * cellW;
            const y = crownY + row * cellH;
            const isCenter = col === 1 && row === 1;
            return (
              <rect
                key={s}
                x={x + 1}
                y={y + 1}
                width={cellW - 2}
                height={cellH - 2}
                rx={1.5}
                fill={fill}
                stroke={stroke}
                strokeWidth={isCenter ? 0.8 : 0.6}
                opacity={(data || status !== "HEALTHY") ? 0.95 : 0}
                onClick={(e) => {
                  e.stopPropagation();
                  onClickSurface(s);
                }}
                style={{ cursor: "pointer" }}
              >
                <title>{`${s} surface`}</title>
              </rect>
            );
          })}
        {/* Missing X */}
        {missing && (
          <g stroke="#78716c" strokeWidth={2} strokeLinecap="round">
            <line x1={crownX + 4} y1={crownY + 4} x2={crownX + cw - 4} y2={crownY + ch - 4} />
            <line x1={crownX + cw - 4} y1={crownY + 4} x2={crownX + 4} y2={crownY + ch - 4} />
          </g>
        )}
        {/* Selection ring */}
        {selected && (
          <rect
            x={crownX - 2}
            y={(arch === "upper" ? rootY : crownY) - 2}
            width={cw + 4}
            height={ch + rh + 4}
            rx={5}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={1.5}
            strokeDasharray="2 2"
          />
        )}
      </svg>
      {/* FDI / Universal label */}
      <span
        className={cn(
          "absolute left-1/2 -translate-x-1/2 text-[8px] sm:text-[9px] font-bold text-stone-600",
          arch === "upper" ? "-bottom-3.5" : "-top-3.5"
        )}
      >
        {label}
      </span>
    </button>
  );
}

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
  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

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
    queryFn: async (): Promise<HistoryResponse> => {
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

  function fdiToDisplay(fdi: number): string {
    if (numbering === "UNIVERSAL") return UNIVERSAL_MAP[fdi] ?? String(fdi);
    return String(fdi);
  }

  const [initialSurface, setInitialSurface] = useState<Surface | null>(null);

  function Tooth({ fdi, arch }: { fdi: number; arch: "upper" | "lower" }) {
    const t = teethByFdi[fdi];
    const status = (t?.status ?? "HEALTHY") as ToothStatus;
    return (
      <ToothSVG
        fdi={fdi}
        arch={arch}
        status={status}
        surfaces={t?.surfaces ?? null}
        selected={selectedFdi === fdi}
        label={fdiToDisplay(fdi)}
        onClickTooth={() => {
          setInitialSurface(null);
          setSelectedFdi(fdi);
        }}
        onClickSurface={(surface) => {
          setInitialSurface(surface);
          setSelectedFdi(fdi);
        }}
      />
    );
  }

  function ToothRow({ fdis, arch }: { fdis: number[]; arch: "upper" | "lower" }) {
    return (
      <div className={cn("flex gap-1 sm:gap-1.5", arch === "upper" ? "items-end" : "items-start")}>
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smile className="w-5 h-5 text-blue-500" />
          <h2 className="text-base font-semibold text-stone-900">Dental Chart</h2>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
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

      {!isLoading && chartRes?.chart && (
        <>
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 sm:p-5 space-y-3 overflow-x-auto">
            <div className="space-y-3 min-w-fit">
              <div className="text-center text-[9px] uppercase tracking-wider text-stone-400">Upper · Right ◀  ▶ Left</div>
              <div className="flex justify-center items-end gap-3 sm:gap-4 pb-3">
                <ToothRow fdis={upperFdisLeft} arch="upper" />
                <div className="w-px h-10 bg-stone-200 self-end" />
                <ToothRow fdis={upperFdisRight} arch="upper" />
              </div>
              <div className="h-px bg-stone-200 mx-8" />
              <div className="flex justify-center items-start gap-3 sm:gap-4 pt-3">
                <ToothRow fdis={lowerFdisLeft} arch="lower" />
                <div className="w-px h-10 bg-stone-200 self-start" />
                <ToothRow fdis={lowerFdisRight} arch="lower" />
              </div>
              <div className="text-center text-[9px] uppercase tracking-wider text-stone-400">Lower</div>
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
          onClose={() => { setSelectedFdi(null); setInitialSurface(null); }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["dental-chart", patientId] })}
        />
      )}

      {showHistory && (
        <HistoryPanel history={history} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}

// ───────── tooth editor panel ─────────

function ToothPanel({
  chartId, fdi, existing, initialSurface, onClose, onSaved,
}: {
  chartId: string;
  fdi: number;
  existing?: ToothRecord;
  initialSurface?: Surface | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<ToothStatus>(existing?.status ?? "HEALTHY");
  const [priority, setPriority] = useState(existing?.priority ?? "MEDIUM");
  const [plannedTreatment, setPlannedTreatment] = useState(existing?.plannedTreatment ?? "");
  const [completedTreatment, setCompletedTreatment] = useState(existing?.completedTreatment ?? "");
  const [conditions, setConditions] = useState(existing?.conditions ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [surfaces, setSurfaces] = useState<Partial<Record<Surface, SurfaceData>>>(existing?.surfaces ?? {});

  const save = useMutation({
    mutationFn: async () => {
      const body = { status, priority, plannedTreatment, completedTreatment, conditions, notes, surfaces };
      const r = await fetch(`/api/dental-chart/${chartId}/teeth/${fdi}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to save");
      return j.data;
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const reset = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/dental-chart/${chartId}/teeth/${fdi}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to reset");
      return j.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dental-chart"] });
      onClose();
    },
  });

  function updateSurface(s: Surface, field: keyof SurfaceData, value: string) {
    setSurfaces((prev) => ({
      ...prev,
      [s]: { ...(prev[s] ?? {}), [field]: value || undefined },
    }));
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white w-full sm:w-[480px] sm:max-h-[88vh] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-stone-100 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-stone-900">Tooth #{fdi}</span>
            <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium border", STATUS_STYLES[status].border, STATUS_STYLES[status].text, STATUS_STYLES[status].bg)}>
              {STATUS_STYLES[status].label}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded-md text-stone-400 hover:text-stone-700">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-stone-600 mb-1.5 block">Status</label>
            <div className="grid grid-cols-3 gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "px-2 py-1.5 rounded-lg border-2 text-[10px] font-semibold transition-all",
                    status === s
                      ? `${STATUS_STYLES[s].border} ${STATUS_STYLES[s].bg} ${STATUS_STYLES[s].text}`
                      : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                  )}
                >
                  {STATUS_STYLES[s].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-600 mb-1.5 block">Priority</label>
            <div className="flex gap-1">
              {(["EMERGENCY", "HIGH", "MEDIUM", "COSMETIC"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    "flex-1 px-2 py-1 rounded-md border text-[10px] font-semibold",
                    priority === p
                      ? p === "EMERGENCY" ? "border-red-300 bg-red-50 text-red-700"
                      : p === "HIGH" ? "border-amber-300 bg-amber-50 text-amber-700"
                      : p === "MEDIUM" ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-stone-300 bg-stone-50 text-stone-700"
                      : "border-stone-200 bg-white text-stone-400"
                  )}
                >
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <Input label="Conditions" placeholder="e.g. Cavity, Fracture, Sensitivity" value={conditions} onChange={(e) => setConditions(e.target.value)} />
          <Input label="Planned Treatment" placeholder="e.g. Root Canal, Crown" value={plannedTreatment} onChange={(e) => setPlannedTreatment(e.target.value)} />
          <Input label="Completed Treatment" placeholder="e.g. Filling — composite occlusal" value={completedTreatment} onChange={(e) => setCompletedTreatment(e.target.value)} />

          <div>
            <label className="text-xs font-medium text-stone-600 mb-1.5 block">Surfaces</label>
            <div className="space-y-2">
              {(Object.keys(SURFACE_LABELS) as Surface[]).map((s) => {
                const data = surfaces[s] ?? {};
                const hasData = data.condition || data.treatment || data.plannedTreatment || data.completedTreatment || data.notes;
                return (
                  <details key={s} className="bg-stone-50 rounded-lg border border-stone-200" open={!!hasData || initialSurface === s}>
                    <summary className="px-3 py-2 cursor-pointer text-[11px] font-semibold text-stone-700 flex items-center justify-between select-none">
                      <span>{SURFACE_LABELS[s]}</span>
                      {hasData && <span className="text-[9px] text-blue-500 font-normal">●</span>}
                    </summary>
                    <div className="p-2 pt-0 space-y-1.5">
                      <input
                        className="w-full px-2 py-1 text-[11px] rounded-md border border-stone-200 bg-white"
                        placeholder="Condition (e.g. Caries)"
                        value={data.condition ?? ""}
                        onChange={(e) => updateSurface(s, "condition", e.target.value)}
                      />
                      <input
                        className="w-full px-2 py-1 text-[11px] rounded-md border border-stone-200 bg-white"
                        placeholder="Planned treatment"
                        value={data.plannedTreatment ?? ""}
                        onChange={(e) => updateSurface(s, "plannedTreatment", e.target.value)}
                      />
                      <input
                        className="w-full px-2 py-1 text-[11px] rounded-md border border-stone-200 bg-white"
                        placeholder="Completed treatment"
                        value={data.completedTreatment ?? ""}
                        onChange={(e) => updateSurface(s, "completedTreatment", e.target.value)}
                      />
                      <input
                        className="w-full px-2 py-1 text-[11px] rounded-md border border-stone-200 bg-white"
                        placeholder="Notes"
                        value={data.notes ?? ""}
                        onChange={(e) => updateSurface(s, "notes", e.target.value)}
                      />
                    </div>
                  </details>
                );
              })}
            </div>
          </div>

          <Textarea label="Tooth Notes" placeholder="Patient-history relevant notes for this tooth…" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />

          {save.isError && <p className="text-[11px] text-red-500">{(save.error as Error).message}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-stone-100 p-3 flex items-center justify-between gap-2">
          <button
            onClick={() => reset.mutate()}
            disabled={reset.isPending || !existing}
            className="px-3 py-1.5 rounded-md text-[11px] font-medium text-stone-500 hover:text-red-600 disabled:opacity-30 transition-colors"
          >
            Reset tooth
          </button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button size="sm" iconLeft={<Save className="w-3.5 h-3.5" />} onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────── history panel ─────────

function HistoryPanel({ history, onClose }: { history?: HistoryResponse; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white">
      <div className="flex items-center justify-between p-3 border-b border-stone-100">
        <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
          <History className="w-4 h-4 text-stone-500" />
          Tooth Timeline
        </div>
        <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-400">
          <XIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-stone-100">
        {!history ? (
          <div className="p-6 flex justify-center"><LoadingSpinner size="sm" /></div>
        ) : history.events.length === 0 ? (
          <div className="p-6 text-center text-xs text-stone-400">No events yet</div>
        ) : (
          history.events.map((e) => (
            <div key={e.id} className="px-3 py-2 flex items-start gap-3 text-[11px]">
              <span className="font-mono text-stone-400 shrink-0 w-12">#{e.tooth.fdi}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-stone-700">
                  {e.eventType.replace(/_/g, " ").toLowerCase()}
                  {e.previousStatus && e.newStatus && (
                    <span className="text-stone-400 font-normal ml-1">: {e.previousStatus} → {e.newStatus}</span>
                  )}
                  {e.surface && <span className="text-stone-400 font-normal ml-1">· {e.surface}</span>}
                </p>
                {e.notes && <p className="text-stone-500 truncate">{e.notes}</p>}
              </div>
              <span className="text-stone-400 shrink-0 text-[10px]">
                {new Date(e.occurredAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
