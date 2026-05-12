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
import { Smile, Save, X as XIcon, History, Plus, Activity, Layers, FileText, Trash2, AlertTriangle, Sparkles, Check, Zap } from "lucide-react";
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

/**
 * Derive the visual "effective" status from all data on the tooth.
 * Falls back to the explicit status when set, otherwise infers from
 * conditions text, surface data, or treatment fields.  Lets the chart
 * paint a tooth as "having a condition" even when the user only filled
 * the conditions/surfaces fields and never explicitly changed status.
 */
function effectiveStatus(tooth: ToothRecord | undefined): ToothStatus {
  if (!tooth) return "HEALTHY";
  if (tooth.status && tooth.status !== "HEALTHY") return tooth.status as ToothStatus;

  // Completed treatment → TREATED
  if (tooth.completedTreatment?.trim()) return "TREATED";
  for (const d of Object.values(tooth.surfaces ?? {})) {
    if (d?.completedTreatment?.trim()) return "TREATED";
  }

  // Condition text → infer kind
  const collectedText = [
    tooth.conditions ?? "",
    ...Object.values(tooth.surfaces ?? {}).map((d) => d?.condition ?? ""),
  ].join(" ").toLowerCase();
  if (collectedText.match(/cavit|caries|decay/))             return "CARIES";
  if (collectedText.match(/fract|crack|chip/))               return "FRACTURE";
  if (collectedText.match(/mobil/))                          return "MOBILITY";
  if (collectedText.match(/abscess|infect|peri[a-z]*lesion/))return "PROBLEM";
  if (collectedText.match(/erosion|attrit|abrasion/))        return "PROBLEM";
  if (collectedText.match(/sensi/))                          return "PROBLEM";

  // Planned treatment → flag as needs attention
  if (tooth.plannedTreatment?.trim()) return "UNDER_TREATMENT";
  for (const d of Object.values(tooth.surfaces ?? {})) {
    if (d?.plannedTreatment?.trim()) return "UNDER_TREATMENT";
  }

  // Surface conditions (anything else) → generic PROBLEM
  for (const d of Object.values(tooth.surfaces ?? {})) {
    if (d?.condition?.trim()) return "PROBLEM";
  }

  return "HEALTHY";
}

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

/**
 * ToothSVG — two-view anatomical tooth drawing matching the standard
 * paper dental-chart layout.
 *
 *   Upper arch:        Lower arch:
 *   ┌───────┐          ┌───────┐
 *   │ side  │          │occlusal│
 *   │ view  │          │ view  │
 *   ├───────┤          ├───────┤
 *   │occlusal│         │ side  │
 *   │ view  │          │ view  │
 *   └───────┘          └───────┘
 *
 * Side view: anatomical drawing of the tooth from the buccal/labial
 * direction. Roots point toward the gum line (upper = up, lower = down).
 * Tooth shape varies by category — incisors are flat with a single root,
 * canines have a pointed cusp + long root, premolars have 2 cusps and a
 * single root that may bifurcate, molars have multiple cusps + 2-3 roots.
 *
 * Occlusal view: the chewing surface looking down from above. Contains
 * the 5-surface clickable cross (M / D / O / B / L). For incisors and
 * canines the occlusal view is just a simple oval/pointed shape (no real
 * occlusal surface to mark — just an incisal edge), but we still surface
 * the 5-cell cross for consistency. For premolars there's a "+" mark
 * indicating the central pit. For molars it's a 4-quadrant grid.
 */
function ToothSVG({ fdi, arch, status, surfaces, selected, label, onClickTooth, onClickSurface }: ToothSVGProps) {
  const cat = toothCategory(fdi);
  const missing = status === "MISSING";

  // Per-category sizes (SVG units).
  const sideW = cat === "incisor" ? 22 : cat === "canine" ? 24 : cat === "premolar" ? 26 : 32;
  const sideH = 52;          // crown + root
  const occlW = sideW - 2;   // slightly narrower than side view
  const occlH = cat === "molar" ? 22 : cat === "premolar" ? 20 : 24;
  const VB_W = Math.max(sideW, occlW) + 4;
  const VB_H = sideH + occlH + 6;

  // For upper teeth: side on top, occlusal on bottom.
  // For lower teeth: occlusal on top, side on bottom.
  const sideTop = arch === "upper" ? 1 : occlH + 5;
  const occlTop = arch === "upper" ? sideH + 5 : 1;

  // Mesial / distal orientation. M is always toward the centre of the
  // mouth — for Q1+Q4 (right side, viewed from chair) M sits on the
  // inner edge which is the RIGHT in our row layout. Q2+Q3 flip.
  const quadrant = Math.floor(fdi / 10);
  const mOnRight = quadrant === 1 || quadrant === 4 || quadrant === 5 || quadrant === 8;

  // Crown / root paths for the side view.
  const sideCrownPath = sideViewPath(cat, sideW, sideH, arch);

  return (
    <button
      type="button"
      onClick={onClickTooth}
      title={`FDI ${fdi} · ${cat} · ${STATUS_STYLES[status].label}`}
      className={cn(
        "relative inline-block transition-all align-bottom",
        selected ? "drop-shadow-lg scale-105 z-10" : "hover:drop-shadow-md",
        missing && "opacity-40"
      )}
    >
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width={VB_W * 1.6} height={VB_H * 1.6} className="overflow-visible">
        {/* ────── Side view (anatomical) ────── */}
        <g transform={`translate(${(VB_W - sideW) / 2}, ${sideTop})`}>
          {/* Status-tinted fill behind the outline so the whole tooth
              colors when status is non-healthy */}
          {!missing && status !== "HEALTHY" && (
            <path
              d={sideCrownPath}
              fill={surfaceFill(status, undefined).fill}
              opacity={0.7}
            />
          )}
          <path
            d={sideCrownPath}
            fill={status === "HEALTHY" || missing ? "white" : "none"}
            stroke="#475569"
            strokeWidth={1.1}
            strokeLinejoin="round"
          />
        </g>

        {/* ────── Occlusal view (chewing surface) ────── */}
        <g transform={`translate(${(VB_W - occlW) / 2}, ${occlTop})`}>
          <OcclusalView
            cat={cat}
            w={occlW}
            h={occlH}
            status={status}
            surfaces={surfaces ?? undefined}
            mOnRight={mOnRight}
            arch={arch}
            onClickSurface={onClickSurface}
          />
        </g>

        {/* ────── Missing X ────── */}
        {missing && (
          <g stroke="#78716c" strokeWidth={1.6} strokeLinecap="round">
            <line x1={4} y1={4} x2={VB_W - 4} y2={VB_H - 4} />
            <line x1={VB_W - 4} y1={4} x2={4} y2={VB_H - 4} />
          </g>
        )}

        {/* ────── Selection ring ────── */}
        {selected && (
          <rect
            x={1}
            y={1}
            width={VB_W - 2}
            height={VB_H - 2}
            rx={4}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={1.2}
            strokeDasharray="2 2"
          />
        )}
      </svg>

      {/* FDI / Universal label */}
      <span
        className={cn(
          "absolute left-1/2 -translate-x-1/2 text-[8px] sm:text-[10px] font-bold text-stone-700",
          arch === "upper" ? "-top-4" : "-bottom-4"
        )}
      >
        {label}
      </span>
    </button>
  );
}

/**
 * Anatomical side-view path per tooth category.
 * Returns an SVG path string. Coordinates use the local 0..w / 0..h box.
 * Roots point up for upper teeth, down for lower teeth.
 */
function sideViewPath(cat: ToothCategory, w: number, h: number, arch: "upper" | "lower"): string {
  const crownH = h * 0.50;
  const rootH = h * 0.50;
  const crownTop = arch === "upper" ? rootH : 0;
  const crownBot = crownTop + crownH;
  const rootTop = arch === "upper" ? 0 : crownH;
  const rootBot = rootTop + rootH;
  const mid = w / 2;

  if (cat === "incisor") {
    // Narrow rectangle with rounded chewing edge; single tapered root.
    return [
      `M 1 ${crownTop}`,
      `L ${w - 1} ${crownTop}`,
      `L ${w - 1} ${crownBot - 3}`,
      `Q ${w - 1} ${crownBot} ${w - 4} ${crownBot}`,
      `L 4 ${crownBot}`,
      `Q 1 ${crownBot} 1 ${crownBot - 3}`,
      `Z`,
      // Root (separate sub-path, drawn upward or downward)
      arch === "upper"
        ? `M ${w * 0.25} ${crownTop} L ${mid} ${rootTop + 2} L ${w * 0.75} ${crownTop}`
        : `M ${w * 0.25} ${crownBot} L ${mid} ${rootBot - 2} L ${w * 0.75} ${crownBot}`,
    ].join(" ");
  }

  if (cat === "canine") {
    // Pointed cusp + long single root.
    const cuspTip = arch === "upper" ? crownBot : crownTop;
    const cuspBase = arch === "upper" ? crownBot - 6 : crownTop + 6;
    return [
      // Crown body
      `M 1 ${arch === "upper" ? crownTop : cuspBase}`,
      `L ${w - 1} ${arch === "upper" ? crownTop : cuspBase}`,
      `L ${w - 1} ${arch === "upper" ? cuspBase : crownBot}`,
      `L ${mid} ${cuspTip}`,
      `L 1 ${arch === "upper" ? cuspBase : crownBot}`,
      `Z`,
      // Long root
      arch === "upper"
        ? `M ${w * 0.3} ${crownTop} L ${mid} ${rootTop + 2} L ${w * 0.7} ${crownTop}`
        : `M ${w * 0.3} ${crownBot} L ${mid} ${rootBot - 2} L ${w * 0.7} ${crownBot}`,
    ].join(" ");
  }

  if (cat === "premolar") {
    // Crown with two cusps (W shape on chewing edge), single root with subtle bifurcation tip.
    const cuspDepth = 2.5;
    const c1x = w * 0.30;
    const c2x = w * 0.70;
    const valX = w * 0.5;
    return [
      `M 1 ${crownTop}`,
      `L ${w - 1} ${crownTop}`,
      `L ${w - 1} ${crownBot - 4}`,
      // Right cusp
      `L ${c2x} ${arch === "upper" ? crownBot : crownBot - cuspDepth * 2}`,
      `L ${valX} ${arch === "upper" ? crownBot - cuspDepth * 2 : crownBot}`,
      `L ${c1x} ${arch === "upper" ? crownBot : crownBot - cuspDepth * 2}`,
      `L 1 ${crownBot - 4}`,
      `Z`,
      // Root with slight bifurcation
      arch === "upper"
        ? `M ${w * 0.25} ${crownTop} L ${mid} ${rootTop + 2} L ${w * 0.75} ${crownTop} M ${mid - 1.5} ${rootTop + 5} L ${mid - 1.5} ${rootTop + 2} M ${mid + 1.5} ${rootTop + 5} L ${mid + 1.5} ${rootTop + 2}`
        : `M ${w * 0.25} ${crownBot} L ${mid} ${rootBot - 2} L ${w * 0.75} ${crownBot}`,
    ].join(" ");
  }

  // Molar — wider crown with M-shape chewing edge + 2-3 roots
  const cuspDepth = 3;
  return [
    // Crown
    `M 1 ${crownTop}`,
    `L ${w - 1} ${crownTop}`,
    `L ${w - 1} ${crownBot - 4}`,
    arch === "upper"
      ? `L ${w * 0.75} ${crownBot} L ${w * 0.6} ${crownBot - cuspDepth} L ${w * 0.5} ${crownBot} L ${w * 0.4} ${crownBot - cuspDepth} L ${w * 0.25} ${crownBot}`
      : `L ${w * 0.75} ${crownBot - cuspDepth * 2} L ${w * 0.6} ${crownBot} L ${w * 0.5} ${crownBot - cuspDepth * 2} L ${w * 0.4} ${crownBot} L ${w * 0.25} ${crownBot - cuspDepth * 2}`,
    `L 1 ${crownBot - 4}`,
    `Z`,
    // 3 roots (2 buccal + 1 lingual for upper, 2 for lower)
    arch === "upper"
      ? `M ${w * 0.15} ${crownTop} L ${w * 0.25} ${rootTop + 3} L ${w * 0.35} ${crownTop} M ${w * 0.4} ${crownTop} L ${w * 0.5} ${rootTop + 1} L ${w * 0.6} ${crownTop} M ${w * 0.65} ${crownTop} L ${w * 0.75} ${rootTop + 3} L ${w * 0.85} ${crownTop}`
      : `M ${w * 0.2} ${crownBot} L ${w * 0.32} ${rootBot - 2} L ${w * 0.45} ${crownBot} M ${w * 0.55} ${crownBot} L ${w * 0.68} ${rootBot - 2} L ${w * 0.8} ${crownBot}`,
  ].join(" ");
}

interface OcclusalViewProps {
  cat: ToothCategory;
  w: number;
  h: number;
  status: ToothStatus;
  surfaces: Partial<Record<Surface, SurfaceData>> | undefined;
  mOnRight: boolean;
  arch: "upper" | "lower";
  onClickSurface: (surface: Surface) => void;
}

/**
 * Occlusal (chewing-surface) view + 5-surface clickable cross.
 *
 * Anterior teeth (incisor / canine) show a simple oval — the "occlusal
 * surface" is really an incisal edge so we keep the cross subtle.
 * Premolars get a "+" mark indicating the central pit. Molars show a
 * 4-quadrant grid representing the 4 cusps + central fossa.
 */
function OcclusalView({ cat, w, h, status, surfaces, mOnRight, arch, onClickSurface }: OcclusalViewProps) {
  // Common: outline shape varies per category.
  const outline = (() => {
    if (cat === "incisor" || cat === "canine") {
      // Oval / leaf shape
      return (
        <ellipse
          cx={w / 2}
          cy={h / 2}
          rx={w / 2 - 1}
          ry={h / 2 - 1}
          fill={status === "HEALTHY" ? "white" : surfaceFill(status, undefined).fill}
          fillOpacity={status === "HEALTHY" ? 1 : 0.6}
          stroke="#475569"
          strokeWidth={1.1}
        />
      );
    }
    // Premolars + molars: rounded square
    return (
      <rect
        x={1}
        y={1}
        width={w - 2}
        height={h - 2}
        rx={cat === "premolar" ? 4 : 2}
        fill={status === "HEALTHY" ? "white" : surfaceFill(status, undefined).fill}
        fillOpacity={status === "HEALTHY" ? 1 : 0.6}
        stroke="#475569"
        strokeWidth={1.1}
      />
    );
  })();

  // 5-surface cross — drawn as 5 small overlay rects (almost invisible
  // unless the surface has data, in which case it fills with the
  // surface-state colour). On molars + premolars the surfaces sit on a
  // 3×3 grid. Buccal/lingual orientation:
  //   - For UPPER teeth, looking down: buccal sits "up" (toward viewer's
  //     forehead direction in the chart) which is the row closest to the
  //     UPPER label — that's the TOP of the occlusal view since occlusal
  //     view is below side view for upper teeth. For LOWER teeth the
  //     occlusal view is above the side view, and buccal sits closer to
  //     the LINGUAL center line (which is at the top of lower occlusal).
  //   - To match the paper-chart convention (buccal always faces "out"
  //     toward the patient's lips/cheek), we put buccal:
  //       upper occlusal → toward the UPPER label = TOP row
  //       lower occlusal → toward the LOWER label = BOTTOM row
  const buccalRow = arch === "upper" ? 0 : 2;
  const lingualRow = arch === "upper" ? 2 : 0;
  const mesialCol = mOnRight ? 2 : 0;
  const distalCol = mOnRight ? 0 : 2;

  // Cell geometry
  const cellW = w / 3;
  const cellH = h / 3;
  const surfaces5: Array<{ s: Surface; col: number; row: number }> = [
    { s: "occlusal", col: 1, row: 1 },
    { s: "buccal",   col: 1, row: buccalRow },
    { s: "lingual",  col: 1, row: lingualRow },
    { s: "mesial",   col: mesialCol, row: 1 },
    { s: "distal",   col: distalCol, row: 1 },
  ];

  // For incisor/canine the surface cross sits within the ellipse — clip.
  const clipId = `occl-clip-${cat}-${arch}-${mOnRight ? "r" : "l"}`;

  return (
    <g>
      <defs>
        {(cat === "incisor" || cat === "canine") && (
          <clipPath id={clipId}>
            <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 1} ry={h / 2 - 1} />
          </clipPath>
        )}
      </defs>

      {outline}

      {/* Decorative anatomical marks */}
      {cat === "premolar" && (
        // "+" mark for the central pit
        <g stroke="#16a34a" strokeWidth={0.7} opacity={0.7} pointerEvents="none">
          <line x1={w / 2} y1={h * 0.3} x2={w / 2} y2={h * 0.7} />
          <line x1={w * 0.3} y1={h / 2} x2={w * 0.7} y2={h / 2} />
        </g>
      )}
      {cat === "molar" && (
        // 4-quadrant grid (cross dividing the 4 cusps)
        <g stroke="#16a34a" strokeWidth={0.7} opacity={0.65} pointerEvents="none">
          <line x1={w / 2} y1={2} x2={w / 2} y2={h - 2} />
          <line x1={2} y1={h / 2} x2={w - 2} y2={h / 2} />
        </g>
      )}

      {/* Surface fills */}
      <g clipPath={cat === "incisor" || cat === "canine" ? `url(#${clipId})` : undefined}>
        {surfaces5.map(({ s, col, row }) => {
          const data = surfaces?.[s];
          const hasData = !!data?.condition || !!data?.completedTreatment || !!data?.plannedTreatment;
          if (!hasData && status === "HEALTHY") return null;
          const { fill, stroke } = surfaceFill(status, data);
          const x = col * cellW;
          const y = row * cellH;
          return (
            <rect
              key={s}
              x={x + 0.5}
              y={y + 0.5}
              width={cellW - 1}
              height={cellH - 1}
              rx={1}
              fill={fill}
              stroke={stroke}
              strokeWidth={0.6}
              opacity={0.9}
              pointerEvents="none"
            />
          );
        })}
      </g>

      {/* Invisible click zones for each surface */}
      {surfaces5.map(({ s, col, row }) => {
        const x = col * cellW;
        const y = row * cellH;
        return (
          <rect
            key={s}
            x={x}
            y={y}
            width={cellW}
            height={cellH}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); onClickSurface(s); }}
          >
            <title>{`${s} surface`}</title>
          </rect>
        );
      })}
    </g>
  );
}

// ───────── modern U-shaped arch view ─────────

const ARCH_FDI_ORDER: { upper: number[]; lower: number[] } = {
  // viewer-left → viewer-right = patient-right → patient-left
  upper: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  lower: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
};
const ARCH_FDI_PRIMARY = {
  upper: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  lower: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
};

interface ArchViewProps {
  dentition: "ADULT" | "MIXED" | "PEDIATRIC";
  teethByFdi: Record<number, ToothRecord>;
  selectedFdi: number | null;
  numbering: "FDI" | "UNIVERSAL";
  onClickTooth: (fdi: number) => void;
  onClickSurface: (fdi: number, s: Surface) => void;
  quickMark: ToothStatus | null;
  onQuickMark: (fdi: number, status: ToothStatus) => void;
}

function ArchView({ dentition, teethByFdi, selectedFdi, numbering, onClickTooth, onClickSurface, quickMark, onQuickMark }: ArchViewProps) {
  const [hoveredFdi, setHoveredFdi] = useState<number | null>(null);

  // viewBox set up so the arches fill nicely on desktop and mobile.
  const VB_W = 640;
  const VB_H = 540;

  // Maxillary ellipse (top half visible). More pronounced curve for the modern look.
  const maxCx = 320, maxCy = 230, maxRx = 270, maxRy = 200;
  // Mandibular ellipse (bottom half visible).
  const manCx = 320, manCy = 310, manRx = 270, manRy = 200;

  const upperFdis = dentition === "PEDIATRIC" ? ARCH_FDI_PRIMARY.upper
                  : dentition === "MIXED" ? ARCH_FDI_ORDER.upper // adult full row; primary inset separately
                  : ARCH_FDI_ORDER.upper;
  const lowerFdis = dentition === "PEDIATRIC" ? ARCH_FDI_PRIMARY.lower
                  : ARCH_FDI_ORDER.lower;

  /**
   * Position + rotation for tooth at index i in an arch with N teeth.
   * Uses degrees (SVG convention — clockwise from east).
   */
  function positionOnArch(i: number, n: number, archType: "max" | "man") {
    // Inset slightly from the equator (the leftmost/rightmost points) so
    // wisdoms don't overlap between arches.
    const inset = 8; // degrees
    let startDeg: number, endDeg: number;
    if (archType === "max") {
      // Maxillary: leftmost (180°) → top apex (270°) → rightmost (360°/0°)
      startDeg = 180 + inset;
      endDeg = 360 - inset;
    } else {
      // Mandibular: leftmost (180°) → bottom apex (90°) → rightmost (0°)
      startDeg = 180 - inset;
      endDeg = 0 + inset;
    }
    const t = n === 1 ? 0.5 : i / (n - 1);
    const deg = startDeg + t * (endDeg - startDeg);
    const rad = (deg * Math.PI) / 180;
    const cx = archType === "max" ? maxCx : manCx;
    const cy = archType === "max" ? maxCy : manCy;
    const rx = archType === "max" ? maxRx : manRx;
    const ry = archType === "max" ? maxRy : manRy;
    const x = cx + rx * Math.cos(rad);
    const y = cy + ry * Math.sin(rad);
    // Rotate so tooth's local "outward" (north / -y) points along radial direction
    const rotation = deg + 90; // see notes
    return { x, y, rotation };
  }

  // Build the maxillary midline guide (a curve following the ellipse top)
  const archGuide = (cx: number, cy: number, rx: number, ry: number, top: boolean) => {
    const start = `M ${cx - rx} ${cy}`;
    const end = `${cx + rx} ${cy}`;
    return `${start} A ${rx} ${ry} 0 0 ${top ? 1 : 0} ${end}`;
  };

  const hoveredTooth = hoveredFdi !== null ? teethByFdi[hoveredFdi] : null;
  const hoveredCat = hoveredFdi !== null ? toothCategory(hoveredFdi) : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full max-w-[720px] mx-auto select-none"
      >
        <defs>
          {/* Background — refined cream/pearl gradient suggesting oral cavity */}
          <radialGradient id="arch-bg" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#fefdfb" />
            <stop offset="50%" stopColor="#faf8f5" />
            <stop offset="100%" stopColor="#f0ece5" />
          </radialGradient>

          {/* Subtle dot pattern for chic background texture */}
          <pattern id="arch-pattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.5" fill="#d6d3d1" opacity="0.4" />
          </pattern>

          {/* Pearl enamel — multi-stop for translucent depth */}
          <linearGradient id="tooth-pearl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="25%" stopColor="#fdfcfa" />
            <stop offset="65%" stopColor="#f5f1ea" />
            <stop offset="100%" stopColor="#e8e2d6" />
          </linearGradient>

          {/* Sophisticated status palette — softer, more refined than primary colors */}
          <linearGradient id="g-CARIES" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fee2e8" /><stop offset="100%" stopColor="#f87489" />
          </linearGradient>
          <linearGradient id="g-FILLING" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fef0d4" /><stop offset="100%" stopColor="#d4a449" />
          </linearGradient>
          <linearGradient id="g-CROWN" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fdf2c4" /><stop offset="100%" stopColor="#c79a30" />
          </linearGradient>
          <linearGradient id="g-BRIDGE" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fde8d4" /><stop offset="100%" stopColor="#d97742" />
          </linearGradient>
          <linearGradient id="g-IMPLANT" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dfe8f3" /><stop offset="100%" stopColor="#4c6b8a" />
          </linearGradient>
          <linearGradient id="g-ROOT_CANAL" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ebdcf5" /><stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="g-EXTRACTION_NEEDED" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fecaca" /><stop offset="100%" stopColor="#b91c1c" />
          </linearGradient>
          <linearGradient id="g-MOBILITY" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fce4ec" /><stop offset="100%" stopColor="#c2185b" />
          </linearGradient>
          <linearGradient id="g-FRACTURE" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e0dcf5" /><stop offset="100%" stopColor="#6d4ca0" />
          </linearGradient>
          <linearGradient id="g-UNDER_TREATMENT" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dff7fa" /><stop offset="100%" stopColor="#0e95b3" />
          </linearGradient>
          <linearGradient id="g-TREATED" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dcf4e3" /><stop offset="100%" stopColor="#5b9b6d" />
          </linearGradient>
          <linearGradient id="g-MISSING" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e7e5e4" /><stop offset="100%" stopColor="#a8a29e" />
          </linearGradient>
          <linearGradient id="g-PROBLEM" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fee2e8" /><stop offset="100%" stopColor="#f87489" />
          </linearGradient>

          {/* Enamel shine — diagonal highlight gradient */}
          <linearGradient id="enamel-shine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.6" />
            <stop offset="40%" stopColor="white" stopOpacity="0" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>

          {/* Refined drop shadow for chic depth */}
          <filter id="tooth-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="0.6" />
            <feOffset dx="0" dy="0.8" result="shadow" />
            <feComponentTransfer><feFuncA type="linear" slope="0.25" /></feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Glow for hover/selected — sophisticated blue ring */}
          <filter id="tooth-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
            <feOffset dx="0" dy="0" result="shadow" />
            <feComponentTransfer><feFuncA type="linear" slope="0.4" /></feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Background plate with pattern overlay */}
        <rect x={0} y={0} width={VB_W} height={VB_H} fill="url(#arch-bg)" rx={24} />
        <rect x={0} y={0} width={VB_W} height={VB_H} fill="url(#arch-pattern)" rx={24} opacity={0.7} />

        {/* Refined inner vignette — softer, suggests palate depth */}
        <ellipse cx={VB_W / 2} cy={VB_H / 2} rx={170} ry={130} fill="#fefdfb" opacity={0.5} />
        <ellipse cx={VB_W / 2} cy={VB_H / 2} rx={90} ry={60} fill="#faf5ed" opacity={0.4} />

        {/* Arch guides — single elegant continuous curve, more refined */}
        <path d={archGuide(maxCx, maxCy, maxRx, maxRy, false)} fill="none" stroke="#a8a29e" strokeWidth={0.8} strokeDasharray="3 5" opacity={0.4} />
        <path d={archGuide(manCx, manCy, manRx, manRy, true)} fill="none" stroke="#a8a29e" strokeWidth={0.8} strokeDasharray="3 5" opacity={0.4} />

        {/* Midline — refined */}
        <line x1={VB_W / 2} y1={36} x2={VB_W / 2} y2={VB_H - 36} stroke="#a8a29e" strokeWidth={0.5} strokeDasharray="4 6" opacity={0.35} />

        {/* Axis labels — sophisticated typography */}
        <text x={VB_W / 2} y={22} fontSize={9} fontWeight={600} textAnchor="middle" fill="#78716c" letterSpacing="6">UPPER</text>
        <text x={VB_W / 2} y={VB_H - 10} fontSize={9} fontWeight={600} textAnchor="middle" fill="#78716c" letterSpacing="6">LOWER</text>
        <text x={22} y={VB_H / 2 + 4} fontSize={9} fontWeight={600} textAnchor="start" fill="#78716c" letterSpacing="4">RIGHT</text>
        <text x={VB_W - 22} y={VB_H / 2 + 4} fontSize={9} fontWeight={600} textAnchor="end" fill="#78716c" letterSpacing="4">LEFT</text>

        {/* Maxillary teeth */}
        {upperFdis.map((fdi, i) => {
          const { x, y, rotation } = positionOnArch(i, upperFdis.length, "max");
          return (
            <ArchTooth
              key={fdi}
              fdi={fdi}
              x={x}
              y={y}
              rotation={rotation}
              tooth={teethByFdi[fdi]}
              selected={selectedFdi === fdi}
              hovered={hoveredFdi === fdi}
              label={numbering === "FDI" ? String(fdi) : (UNIVERSAL_MAP[fdi] ?? String(fdi))}
              arch="upper"
              quickMark={quickMark}
              onHover={(over) => setHoveredFdi(over ? fdi : null)}
              onClickTooth={() => {
                if (quickMark) onQuickMark(fdi, quickMark);
                else onClickTooth(fdi);
              }}
              onClickSurface={(s) => onClickSurface(fdi, s)}
            />
          );
        })}

        {/* Mandibular teeth */}
        {lowerFdis.map((fdi, i) => {
          const { x, y, rotation } = positionOnArch(i, lowerFdis.length, "man");
          return (
            <ArchTooth
              key={fdi}
              fdi={fdi}
              x={x}
              y={y}
              rotation={rotation}
              tooth={teethByFdi[fdi]}
              selected={selectedFdi === fdi}
              hovered={hoveredFdi === fdi}
              label={numbering === "FDI" ? String(fdi) : (UNIVERSAL_MAP[fdi] ?? String(fdi))}
              arch="lower"
              quickMark={quickMark}
              onHover={(over) => setHoveredFdi(over ? fdi : null)}
              onClickTooth={() => {
                if (quickMark) onQuickMark(fdi, quickMark);
                else onClickTooth(fdi);
              }}
              onClickSurface={(s) => onClickSurface(fdi, s)}
            />
          );
        })}

        {/* Centre arch labels */}
        <text x={VB_W / 2} y={maxCy + 8} fontSize={10} fontWeight={700} textAnchor="middle" fill="#cbd5e1" letterSpacing="2">MAXILLARY</text>
        <text x={VB_W / 2} y={manCy - 4} fontSize={10} fontWeight={700} textAnchor="middle" fill="#cbd5e1" letterSpacing="2">MANDIBULAR</text>
      </svg>

      {/* Floating info card — appears top-right when hovering a tooth */}
      {hoveredFdi !== null && (() => {
        const hStatus = effectiveStatus(hoveredTooth ?? undefined);
        const hExplicit = (hoveredTooth?.status ?? "HEALTHY") as ToothStatus;
        const hSurfaces = hoveredTooth?.surfaces
          ? (Object.entries(hoveredTooth.surfaces) as [Surface, SurfaceData | undefined][])
              .filter(([, d]) => !!(d?.condition || d?.completedTreatment || d?.plannedTreatment))
          : [];
        return (
          <div className="absolute top-3 right-3 sm:top-5 sm:right-5 pointer-events-none">
            <div className="bg-white/96 backdrop-blur-md border border-stone-200/80 rounded-2xl shadow-xl px-4 py-3 min-w-[200px] max-w-[280px] animate-fade-in">
              {/* Header */}
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xl font-bold text-stone-900 tracking-tight">
                  {numbering === "FDI" ? `#${hoveredFdi}` : `#${UNIVERSAL_MAP[hoveredFdi] ?? hoveredFdi}`}
                </span>
                <span className="text-[9px] uppercase tracking-widest text-stone-400 font-bold">
                  {hoveredCat}
                </span>
              </div>

              {/* Whole-tooth status — uses derived effective status */}
              <div className="flex items-center gap-1.5 mt-1.5 pb-1.5 border-b border-stone-100">
                <span className={cn("w-2 h-2 rounded-full", STATUS_STYLES[hStatus].dot)} />
                <span className="text-[11px] font-semibold text-stone-700">
                  {STATUS_STYLES[hStatus].label}
                </span>
                {hExplicit === "HEALTHY" && hStatus !== "HEALTHY" && (
                  <span className="text-[9px] text-stone-400 italic">(inferred)</span>
                )}
                {hoveredTooth?.priority && hoveredTooth.priority !== "MEDIUM" && (
                  <span className={cn(
                    "ml-auto text-[9px] uppercase font-bold px-1.5 py-0.5 rounded",
                    hoveredTooth.priority === "EMERGENCY" ? "text-red-600 bg-red-50"
                    : hoveredTooth.priority === "HIGH" ? "text-amber-600 bg-amber-50"
                    : "text-violet-600 bg-violet-50"
                  )}>
                    {hoveredTooth.priority}
                  </span>
                )}
              </div>

              {/* Surface issues — one row per affected surface */}
              {hSurfaces.length > 0 && (
                <div className="mt-2 space-y-1">
                  {hSurfaces.map(([s, d]) => (
                    <div key={s} className="flex items-start gap-2 text-[10px]">
                      <span className="w-4 h-4 shrink-0 rounded-md bg-stone-100 text-stone-700 font-bold flex items-center justify-center text-[9px]">
                        {s.charAt(0).toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        {d?.condition && <p className="text-rose-600 font-medium truncate">{d.condition}</p>}
                        {d?.plannedTreatment && <p className="text-cyan-600 truncate">→ {d.plannedTreatment}</p>}
                        {d?.completedTreatment && <p className="text-emerald-600 truncate">✓ {d.completedTreatment}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Whole-tooth planned/completed */}
              {(hoveredTooth?.plannedTreatment || hoveredTooth?.completedTreatment) && (
                <div className="mt-2 pt-1.5 border-t border-stone-100 space-y-0.5">
                  {hoveredTooth.plannedTreatment && (
                    <p className="text-[10px] text-cyan-600 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-cyan-500" />
                      Plan: <span className="font-medium">{hoveredTooth.plannedTreatment}</span>
                    </p>
                  )}
                  {hoveredTooth.completedTreatment && (
                    <p className="text-[10px] text-emerald-600 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-emerald-500" />
                      Done: <span className="font-medium">{hoveredTooth.completedTreatment}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Notes preview */}
              {hoveredTooth?.notes && (
                <p className="text-[10px] text-stone-500 mt-2 italic leading-tight border-t border-stone-100 pt-1.5 line-clamp-2">
                  {hoveredTooth.notes}
                </p>
              )}

              {/* Click hint */}
              <p className="text-[9px] text-stone-300 mt-2 uppercase tracking-wider font-semibold">
                Click to edit · drag to mark surfaces
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

interface ArchToothProps {
  fdi: number;
  x: number;
  y: number;
  rotation: number;
  tooth?: ToothRecord;
  selected: boolean;
  hovered: boolean;
  label: string;
  arch: "upper" | "lower";
  quickMark: ToothStatus | null;
  onHover: (over: boolean) => void;
  onClickTooth: () => void;
  onClickSurface: (s: Surface) => void;
}

/**
 * Single tooth in the modern U-shaped arch. Rendered at the arch
 * position with category-specific anatomical detail, gradient fill,
 * soft drop shadow, and a hover-lift animation. The 5 surfaces
 * (M/D/O/B/L) remain clickable directly on the occlusal face.
 */
function ArchTooth({ fdi, x, y, rotation, tooth, selected, hovered, label, arch, quickMark, onHover, onClickTooth, onClickSurface }: ArchToothProps) {
  const cat = toothCategory(fdi);
  // status = the visual / "effective" status (driven by data, not just the
  // explicit field) so any condition / surface / planned treatment tints
  // the tooth body. The user-explicit field is preserved at `tooth.status`.
  const status = effectiveStatus(tooth);
  const explicitStatus = (tooth?.status ?? "HEALTHY") as ToothStatus;
  const missing = explicitStatus === "MISSING";

  // Per-category dimensions for the occlusal face — slightly larger
  // for the modern view so the anatomical detail is legible.
  const w = cat === "incisor" ? 22 : cat === "canine" ? 24 : cat === "premolar" ? 28 : 34;
  const h = cat === "incisor" ? 28 : cat === "canine" ? 30 : cat === "premolar" ? 28 : 32;

  // Mesial / distal: M is always toward the centre of the mouth (midline).
  const quadrant = Math.floor(fdi / 10);
  const mOnRight = quadrant === 1 || quadrant === 4 || quadrant === 5 || quadrant === 8;
  // In the arch view, the tooth is rotated so the "outward" direction
  // points away from the arch centre. Buccal (cheek side) = outward = top
  // of the rotated tooth. Lingual = bottom (toward arch centre).
  // M / D are the left/right sides of the local frame. For Q1+Q4 (right
  // side of the mouth, viewer's left half of the chart) M is on the inner
  // edge — which after rotation lands on the side closer to the midline.

  // Surface fills
  const fillFor = (s: Surface) => surfaceFill(status, tooth?.surfaces?.[s]);

  // 5-region geometry (within the occlusal rect/oval, local frame):
  //   Top middle    = Buccal
  //   Bottom middle = Lingual
  //   Left middle   = mesial OR distal depending on quadrant
  //   Right middle  = the other one
  //   Center        = Occlusal
  const cellW = w / 3;
  const cellH = h / 3;
  const buccalRect    = { x: cellW, y: 0,         w: cellW, h: cellH };
  const lingualRect   = { x: cellW, y: 2 * cellH, w: cellW, h: cellH };
  const centerRect    = { x: cellW, y: cellH,     w: cellW, h: cellH };
  const leftRect      = { x: 0,     y: cellH,     w: cellW, h: cellH };
  const rightRect     = { x: 2*cellW, y: cellH,   w: cellW, h: cellH };
  const mesialRect    = mOnRight ? rightRect : leftRect;
  const distalRect    = mOnRight ? leftRect : rightRect;

  // Whole-tooth gradient fill based on status
  const gradientId = status !== "HEALTHY" && !missing ? `g-${status}` : "tooth-pearl";
  const strokeColor =
    selected ? "#2563eb"
    : hovered ? "#57534e"
    : "#a8a29e";
  const strokeWidth = selected ? 1.6 : hovered ? 1.2 : 0.9;

  // Count distinct issues on this tooth — used for the issue-count badge.
  // An "issue" is: non-healthy status, OR any surface with data, OR a
  // planned/completed treatment recorded.
  const surfaceIssues = tooth?.surfaces
    ? (Object.entries(tooth.surfaces) as [Surface, SurfaceData | undefined][])
        .filter(([, d]) => !!(d?.condition || d?.completedTreatment || d?.plannedTreatment))
    : [];
  const issueCount =
    (status !== "HEALTHY" && !missing ? 1 : 0) +
    surfaceIssues.length +
    (tooth?.plannedTreatment ? 1 : 0) +
    (tooth?.completedTreatment ? 1 : 0);
  const surfaceIssueColors = surfaceIssues.slice(0, 4).map(([, d]) => {
    if (d?.completedTreatment) return "#5b9b6d"; // emerald
    if (d?.plannedTreatment)   return "#0e95b3"; // cyan
    return "#f87489";                            // rose (caries / condition)
  });

  // Tooth outline shape based on category — slightly more anatomical than v1.
  const outline = (() => {
    if (cat === "incisor" || cat === "canine") {
      const cusp = cat === "canine" ? 5 : 0;
      // Rounded leaf shape (pointier for canines)
      return (
        <path
          d={`M ${w / 2} 0
              Q ${w + 1} 1 ${w} ${h * 0.45}
              Q ${w} ${h - cusp} ${w / 2} ${h - cusp}
              Q 0 ${h - cusp} 0 ${h * 0.45}
              Q -1 1 ${w / 2} 0 Z`}
          fill={`url(#${gradientId})`}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      );
    }
    return (
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={cat === "premolar" ? 6 : 5}
        fill={`url(#${gradientId})`}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
    );
  })();

  // Hover/select lift — scale slightly up
  const lift = selected ? 1.12 : hovered ? 1.08 : 1;
  const filter = selected ? "url(#tooth-glow)" : "url(#tooth-shadow)";

  return (
    <g
      transform={`translate(${x}, ${y}) rotate(${rotation}) scale(${lift})`}
      style={{ transition: "transform 0.12s cubic-bezier(0.4, 0, 0.2, 1)" }}
    >
      <g
        transform={`translate(${-w / 2}, ${-h / 2})`}
        filter={filter}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        onClick={(e) => { e.stopPropagation(); onClickTooth(); }}
        style={{ cursor: quickMark ? "crosshair" : "pointer" }}
      >
        <title>{`Tooth ${label} (FDI ${fdi}) · ${cat} · ${STATUS_STYLES[status].label}`}</title>

        {/* Tooth outline (gradient-filled, status-tinted) */}
        {outline}

        {/* Enamel shine — diagonal translucent highlight in the top-left
            corner of every tooth. Creates a subtle 3D / glossy effect. */}
        {!missing && (
          <g pointerEvents="none" opacity={0.75}>
            {cat === "incisor" || cat === "canine" ? (
              <path
                d={`M ${w * 0.18} ${h * 0.15} Q ${w * 0.45} ${h * 0.05} ${w * 0.55} ${h * 0.35} Q ${w * 0.35} ${h * 0.45} ${w * 0.18} ${h * 0.15} Z`}
                fill="url(#enamel-shine)"
              />
            ) : (
              <path
                d={`M ${w * 0.12} ${h * 0.12} Q ${w * 0.42} ${h * 0.05} ${w * 0.52} ${h * 0.3} Q ${w * 0.3} ${h * 0.4} ${w * 0.12} ${h * 0.12} Z`}
                fill="url(#enamel-shine)"
              />
            )}
          </g>
        )}

        {/* Anatomical hints — refined for chic feel */}
        {cat === "premolar" && !missing && (
          <g stroke="#a8a29e" strokeWidth={0.5} opacity={0.45} pointerEvents="none">
            <line x1={w / 2} y1={h * 0.3} x2={w / 2} y2={h * 0.7} />
            <line x1={w * 0.3} y1={h / 2} x2={w * 0.7} y2={h / 2} />
            <circle cx={w / 2} cy={h / 2} r={1} fill="#a8a29e" stroke="none" opacity={0.5} />
          </g>
        )}
        {cat === "molar" && !missing && (
          <g pointerEvents="none">
            <g stroke="#a8a29e" strokeWidth={0.45} opacity={0.4}>
              {/* Subtle Y-shape grooves for upper molars, +-shape for lower */}
              {arch === "upper" ? (
                <>
                  <path d={`M ${w / 2} ${h * 0.5} L ${w * 0.3} ${h * 0.2}`} />
                  <path d={`M ${w / 2} ${h * 0.5} L ${w * 0.7} ${h * 0.2}`} />
                  <path d={`M ${w / 2} ${h * 0.5} L ${w / 2} ${h * 0.85}`} />
                </>
              ) : (
                <>
                  <line x1={w / 2} y1={h * 0.18} x2={w / 2} y2={h * 0.82} />
                  <line x1={w * 0.18} y1={h / 2} x2={w * 0.82} y2={h / 2} />
                </>
              )}
            </g>
            {/* Cusp dots — refined, smaller, low-key */}
            <g fill="#a8a29e" opacity={0.45}>
              <circle cx={w * 0.28} cy={h * 0.3} r={1.1} />
              <circle cx={w * 0.72} cy={h * 0.3} r={1.1} />
              <circle cx={w * 0.28} cy={h * 0.7} r={1.1} />
              <circle cx={w * 0.72} cy={h * 0.7} r={1.1} />
            </g>
          </g>
        )}
        {(cat === "incisor" || cat === "canine") && !missing && (
          <g stroke="#a8a29e" strokeWidth={0.45} opacity={0.35} pointerEvents="none">
            <path d={`M ${w * 0.22} ${h * 0.82} Q ${w / 2} ${h - 1} ${w * 0.78} ${h * 0.82}`} fill="none" />
          </g>
        )}

        {/* Surface overlays — only render where surface has its own data */}
        {!missing && (
          <g>
            {([
              ["buccal", buccalRect],
              ["lingual", lingualRect],
              ["mesial", mesialRect],
              ["distal", distalRect],
              ["occlusal", centerRect],
            ] as const).map(([s, r]) => {
              const data = tooth?.surfaces?.[s];
              const hasData = !!(data?.condition || data?.completedTreatment || data?.plannedTreatment);
              if (!hasData) return null;
              const { fill, stroke } = fillFor(s as Surface);
              return (
                <rect
                  key={s}
                  x={r.x + 1}
                  y={r.y + 1}
                  width={r.w - 2}
                  height={r.h - 2}
                  rx={1.4}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={0.6}
                  opacity={0.85}
                  pointerEvents="none"
                />
              );
            })}
          </g>
        )}

        {/* Clickable surface zones (invisible) — disabled when quickMark active (whole-tooth click takes priority) */}
        {!missing && !quickMark && ([
          ["buccal", buccalRect],
          ["lingual", lingualRect],
          ["mesial", mesialRect],
          ["distal", distalRect],
          ["occlusal", centerRect],
        ] as const).map(([s, r]) => (
          <rect
            key={`zone-${s}`}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); onClickSurface(s as Surface); }}
          >
            <title>{s} surface</title>
          </rect>
        ))}

        {/* Missing X */}
        {missing && (
          <g stroke="#78716c" strokeWidth={1.8} strokeLinecap="round" opacity={0.7}>
            <line x1={4} y1={4} x2={w - 4} y2={h - 4} />
            <line x1={w - 4} y1={4} x2={4} y2={h - 4} />
          </g>
        )}

        {/* Priority badge — small dot top-left for non-MEDIUM priorities */}
        {tooth?.priority && tooth.priority !== "MEDIUM" && !missing && (
          <circle
            cx={2}
            cy={2}
            r={2.5}
            fill={
              tooth.priority === "EMERGENCY" ? "#dc2626"
              : tooth.priority === "HIGH" ? "#f59e0b"
              : "#a78bfa"
            }
            stroke="white"
            strokeWidth={0.8}
            pointerEvents="none"
          />
        )}

        {/* Multi-issue count badge — top-right corner, shown when ≥2 distinct issues */}
        {issueCount >= 2 && !missing && (
          <g pointerEvents="none">
            <circle cx={w - 2} cy={2} r={4} fill="#1e293b" stroke="white" strokeWidth={0.8} />
            <text
              x={w - 2}
              y={4.5}
              textAnchor="middle"
              fontSize={5.5}
              fontWeight={800}
              fill="white"
            >
              {issueCount}
            </text>
          </g>
        )}

        {/* Multi-issue dot strip — small colored dots near the bottom of
            the tooth showing each surface issue's color. Lets the doctor
            see at a glance "this tooth has 3 different issues across
            different surfaces". */}
        {surfaceIssueColors.length > 1 && !missing && (
          <g transform={`translate(${w / 2 - (surfaceIssueColors.length * 2.4 - 1) / 2}, ${h - 4})`} pointerEvents="none">
            {surfaceIssueColors.map((color, i) => (
              <circle key={i} cx={i * 2.4} cy={0} r={0.9} fill={color} />
            ))}
          </g>
        )}
      </g>

      {/* FDI label — counter-rotate so the number stays upright. Pill background for legibility */}
      <g transform={`rotate(${-rotation})`} pointerEvents="none">
        <rect
          x={-9}
          y={arch === "upper" ? -h / 2 - 14 : h / 2 + 4}
          width={18}
          height={11}
          rx={5.5}
          fill={selected ? "#2563eb" : "white"}
          stroke={selected ? "#1d4ed8" : "#e2e8f0"}
          strokeWidth={0.6}
        />
        <text
          x={0}
          y={arch === "upper" ? -h / 2 - 6 : h / 2 + 12}
          textAnchor="middle"
          fontSize={8}
          fontWeight={700}
          fill={selected ? "white" : "#475569"}
        >
          {label}
        </text>
      </g>
    </g>
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
  const [viewMode, setViewMode] = useState<"ARCH" | "CLASSIC">("ARCH");
  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [quickMark, setQuickMark] = useState<ToothStatus | null>(null);

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

  function fdiToDisplay(fdi: number): string {
    if (numbering === "UNIVERSAL") return UNIVERSAL_MAP[fdi] ?? String(fdi);
    return String(fdi);
  }

  const [initialSurface, setInitialSurface] = useState<Surface | null>(null);

  function Tooth({ fdi, arch }: { fdi: number; arch: "upper" | "lower" }) {
    const t = teethByFdi[fdi];
    // Use derived effective status so Classic view tints teeth with
    // conditions / surfaces / planned-completed treatments, even when
    // the explicit status field is still HEALTHY.
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
              onClickTooth={(fdi) => { setInitialSurface(null); setSelectedFdi(fdi); }}
              onClickSurface={(fdi, s) => { setInitialSurface(s); setSelectedFdi(fdi); }}
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
          <div className="rounded-xl border border-stone-200 bg-stone-50/40 p-4 sm:p-6 overflow-x-auto">
            <div className="min-w-fit mx-auto" style={{ maxWidth: "fit-content" }}>
              {/* UPPER label */}
              <div className="text-center text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">
                UPPER
              </div>

              {/* Upper arch — side view on top, occlusal on bottom */}
              <div className="flex justify-center items-end gap-5 sm:gap-6 pt-4">
                <div className="flex gap-1.5 sm:gap-2 items-end">
                  <ToothRow fdis={upperFdisLeft} arch="upper" />
                </div>
                <div className="w-px h-28 sm:h-36 border-l border-dashed border-stone-300 self-stretch" />
                <div className="flex gap-1.5 sm:gap-2 items-end">
                  <ToothRow fdis={upperFdisRight} arch="upper" />
                </div>
              </div>

              {/* Center horizontal divider with RIGHT / LINGUAL / LEFT labels */}
              <div className="flex items-center justify-between gap-3 sm:gap-4 my-2 sm:my-3 px-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">RIGHT</span>
                <div className="flex-1 h-px bg-stone-300" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">LINGUAL</span>
                <div className="flex-1 h-px bg-stone-300" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">LEFT</span>
              </div>

              {/* Lower arch — occlusal on top, side view on bottom */}
              <div className="flex justify-center items-start gap-5 sm:gap-6 pb-4">
                <div className="flex gap-1.5 sm:gap-2 items-start">
                  <ToothRow fdis={lowerFdisLeft} arch="lower" />
                </div>
                <div className="w-px h-28 sm:h-36 border-l border-dashed border-stone-300 self-stretch" />
                <div className="flex gap-1.5 sm:gap-2 items-start">
                  <ToothRow fdis={lowerFdisRight} arch="lower" />
                </div>
              </div>

              {/* LOWER label */}
              <div className="text-center text-[10px] font-bold uppercase tracking-widest text-stone-500 mt-2">
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
        />
      )}

      {showHistory && (
        <HistoryPanel history={history} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}

// ───────── tooth editor panel (right-slide drawer) ─────────

const SURFACE_CHIPS: Array<{ key: Surface; label: string; short: string }> = [
  { key: "occlusal", label: "Occlusal",  short: "O" },
  { key: "mesial",   label: "Mesial",    short: "M" },
  { key: "distal",   label: "Distal",    short: "D" },
  { key: "buccal",   label: "Buccal",    short: "B" },
  { key: "lingual",  label: "Lingual",   short: "L" },
];

/** Common conditions — chip presets for fast charting */
const CONDITION_CHIPS = [
  "Cavity", "Sensitivity", "Plaque", "Tartar", "Erosion", "Attrition",
  "Abrasion", "Discoloration", "Chipped", "Cracked", "Mobility",
  "Gingivitis", "Periodontitis", "Recession", "Abscess",
];

/**
 * Quick-action conditions — most common per-surface findings.
 * Each maps to a one-tap state-fill: clicking the pill adds the
 * condition (or treatment) and dismisses the suggestion bar.
 */
const QUICK_CONDITIONS: Array<{
  label: string;
  field: "condition" | "plannedTreatment" | "completedTreatment";
  value: string;
  emoji: string;
  tone: "rose" | "amber" | "emerald" | "cyan" | "stone";
}> = [
  { label: "Cavity",       field: "condition",          value: "Cavity",            emoji: "🔍", tone: "rose"   },
  { label: "Sensitive",    field: "condition",          value: "Sensitivity",       emoji: "⚡", tone: "rose"   },
  { label: "Plaque",       field: "condition",          value: "Plaque",            emoji: "🧫", tone: "amber"  },
  { label: "Cracked",      field: "condition",          value: "Cracked",           emoji: "⚠️", tone: "rose"   },
  { label: "Filling",      field: "plannedTreatment",   value: "Filling",           emoji: "🩹", tone: "cyan"   },
  { label: "RCT",          field: "plannedTreatment",   value: "Root Canal",        emoji: "🦷", tone: "cyan"   },
  { label: "Crown",        field: "plannedTreatment",   value: "Crown",             emoji: "👑", tone: "cyan"   },
  { label: "Filled ✓",     field: "completedTreatment", value: "Composite Filling", emoji: "✓",  tone: "emerald" },
  { label: "Cleaned ✓",    field: "completedTreatment", value: "Cleaning",          emoji: "✨", tone: "emerald" },
];

/** Common dental procedures — chip presets for planned/completed treatment */
const TREATMENT_CHIPS = [
  "Filling", "Composite Filling", "Amalgam Filling",
  "Root Canal", "RCT + Crown",
  "Crown (PFM)", "Crown (Zirconia)", "Crown (E-Max)",
  "Bridge",
  "Extraction", "Surgical Extraction",
  "Implant",
  "Veneer", "Bonding",
  "Scaling", "Polishing", "SRP",
  "Whitening", "Sealant",
  "Pulpotomy", "Apicoectomy",
  "Denture (Partial)", "Denture (Full)",
];

/**
 * Rule-based instant suggestions based on the tooth's current state.
 * Returns 3-6 most-relevant procedures to suggest as quick chips.
 */
function suggestTreatments(status: ToothStatus, cat: ToothCategory, hasSurfaceData: boolean): string[] {
  const anterior = cat === "incisor" || cat === "canine";

  switch (status) {
    case "CARIES":
      // Caries → filling first, then more invasive if deep
      return ["Composite Filling", "Filling", anterior ? "Composite Filling" : "RCT + Crown", "Crown (PFM)"];
    case "FRACTURE":
      return anterior
        ? ["Bonding", "Veneer", "Crown (E-Max)", "Root Canal"]
        : ["Crown (PFM)", "Crown (Zirconia)", "Root Canal", "Extraction"];
    case "ROOT_CANAL":
      // Post-RCT teeth typically need a crown
      return ["Crown (PFM)", "Crown (Zirconia)", "Crown (E-Max)"];
    case "EXTRACTION_NEEDED":
      return ["Extraction", "Surgical Extraction", "Implant", "Bridge"];
    case "MISSING":
      return ["Implant", "Bridge", "Denture (Partial)"];
    case "MOBILITY":
      return ["SRP", "Splinting", "Extraction", "Periodontal evaluation"];
    case "FILLING":
      return ["Crown (PFM)", "RCT + Crown", "Replace filling"];
    case "CROWN":
      return ["Replace crown", "Periapical X-ray", "Endodontic re-evaluation"];
    case "BRIDGE":
      return ["Replace bridge", "Implant-supported crown"];
    case "IMPLANT":
      return ["Implant maintenance", "Crown (Zirconia)"];
    case "TREATED":
      return hasSurfaceData
        ? ["Periapical X-ray", "Crown (PFM)", "Re-evaluation"]
        : ["Scaling", "Polishing", "Fluoride application"];
    case "UNDER_TREATMENT":
      return ["Continue treatment", "Periapical X-ray"];
    case "HEALTHY":
      return ["Scaling", "Polishing", anterior ? "Whitening" : "Sealant", "Fluoride application"];
    default:
      return ["Scaling", "Polishing"];
  }
}

/** Parse a comma-separated string into chip array. */
function parseChips(s: string): string[] {
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}
function joinChips(chips: string[]): string {
  return chips.join(", ");
}

function ToothPanel({
  chartId, fdi, existing, initialSurface, patientId, onClose, onSaved,
}: {
  chartId: string;
  fdi: number;
  existing?: ToothRecord;
  initialSurface?: Surface | null;
  patientId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const cat = toothCategory(fdi);

  const [status, setStatus] = useState<ToothStatus>(existing?.status ?? "HEALTHY");
  const [priority, setPriority] = useState(existing?.priority ?? "MEDIUM");
  const [plannedTreatment, setPlannedTreatment] = useState(existing?.plannedTreatment ?? "");
  const [completedTreatment, setCompletedTreatment] = useState(existing?.completedTreatment ?? "");
  const [conditions, setConditions] = useState(existing?.conditions ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [surfaces, setSurfaces] = useState<Partial<Record<Surface, SurfaceData>>>(existing?.surfaces ?? {});

  // AI suggestion state
  interface AiSuggestion {
    treatment: string;
    cdtCode: string | null;
    rationale: string;
    estimatedVisits: number;
    urgency: "ROUTINE" | "URGENT" | "EMERGENCY";
    confidence: number;
  }
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Instant rule-based suggestions update reactively from status + category + surface data.
  const hasSurfaceData = useMemo(
    () => Object.values(surfaces).some((d) => !!(d?.condition || d?.completedTreatment || d?.plannedTreatment)),
    [surfaces]
  );
  const instantSuggestions = useMemo(
    () => suggestTreatments(status, cat, hasSurfaceData),
    [status, cat, hasSurfaceData]
  );

  const patientIdForAi = patientId; // alias for clarity inside JSX

  async function onAskAi() {
    if (!patientIdForAi) return;
    setAiLoading(true);
    try {
      // Build diagnosis from status + conditions + planned + surfaces
      const condList = parseChips(conditions);
      const diagnosis = [
        `Tooth ${fdi} (${cat})`,
        `Current status: ${STATUS_STYLES[status].label}`,
        condList.length ? `Conditions: ${condList.join(", ")}` : "",
        plannedTreatment ? `Planned: ${plannedTreatment}` : "",
        hasSurfaceData ? `Surfaces with findings: ${(Object.keys(surfaces) as Surface[]).filter((s) => {
          const d = surfaces[s];
          return !!(d?.condition || d?.plannedTreatment);
        }).join(", ")}` : "",
      ].filter(Boolean).join(". ");

      const r = await fetch("/api/ai/treatment-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagnosis: diagnosis || `Tooth ${fdi} ${cat} clinical evaluation`,
          toothFdi: fdi,
          patientId: patientIdForAi,
        }),
      });
      const j = await r.json();
      if (j.success && Array.isArray(j.data?.suggestions)) {
        setAiSuggestions(j.data.suggestions);
      }
    } catch {
      // silent — UI already shows AI button state
    } finally {
      setAiLoading(false);
    }
  }

  // Slide-in animation state — multi-stage for dynamic entrance
  const [mounted, setMounted] = useState(false);          // backdrop fade + panel slide
  const [contentReady, setContentReady] = useState(false); // content stagger trigger
  const [tab, setTab] = useState<"overview" | "surfaces" | "notes">(initialSurface ? "surfaces" : "overview");
  const [activeSurface, setActiveSurface] = useState<Surface | null>(initialSurface ?? null);

  useEffect(() => {
    // Frame 1: panel slides in
    const r1 = requestAnimationFrame(() => setMounted(true));
    // ~200ms later: trigger content stagger
    const t1 = setTimeout(() => setContentReady(true), 180);
    return () => { cancelAnimationFrame(r1); clearTimeout(t1); };
  }, []);

  const handleClose = () => {
    setContentReady(false);
    setMounted(false);
    setTimeout(onClose, 260);
  };

  // Stagger delays for sections inside the panel
  const stagger = (i: number) => ({
    opacity: contentReady ? 1 : 0,
    transform: contentReady ? "translateY(0)" : "translateY(10px)",
    transition: `opacity 280ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 45}ms, transform 320ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 45}ms`,
  });

  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    onSuccess: () => { onSaved(); handleClose(); },
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
      handleClose();
    },
  });

  function updateSurface(s: Surface, field: keyof SurfaceData, value: string) {
    setSurfaces((prev) => ({
      ...prev,
      [s]: { ...(prev[s] ?? {}), [field]: value || undefined },
    }));
  }

  function surfaceHasData(s: Surface): boolean {
    const d = surfaces[s];
    return !!(d?.condition || d?.completedTreatment || d?.plannedTreatment || d?.notes);
  }

  const statusStyle = STATUS_STYLES[status];

  // Cmd/Ctrl + Enter = save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save.mutate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, priority, plannedTreatment, completedTreatment, conditions, notes, surfaces]);

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop — fades + blurs in */}
      <div
        onClick={handleClose}
        style={{
          backdropFilter: mounted ? "blur(4px)" : "blur(0px)",
          transition: "opacity 260ms ease-out, backdrop-filter 260ms ease-out",
        }}
        className={cn(
          "absolute inset-0 bg-slate-900/40",
          mounted ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Right drawer — spring-overshoot slide with subtle scale */}
      <aside
        style={{
          transform: mounted
            ? "translateX(0) scale(1)"
            : "translateX(100%) scale(0.97)",
          transformOrigin: "right center",
          transition: mounted
            // Spring-back easing on entry — slight overshoot then settle
            ? "transform 320ms cubic-bezier(0.34, 1.35, 0.64, 1), box-shadow 200ms ease-out"
            // Faster cleaner exit
            : "transform 220ms cubic-bezier(0.7, 0, 0.84, 0), box-shadow 200ms ease-out",
          boxShadow: mounted
            ? "-30px 0 60px -20px rgba(15, 23, 42, 0.25), -10px 0 30px -10px rgba(15, 23, 42, 0.15)"
            : "none",
        }}
        className="absolute top-0 bottom-0 right-0 w-full sm:w-[440px] md:w-[480px] bg-white flex flex-col will-change-transform"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Edit tooth ${fdi}`}
      >
        {/* ───── Header ───── */}
        <header className="shrink-0 px-5 pt-5 pb-4 border-b border-stone-100" style={stagger(0)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* Mini tooth icon */}
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border-2",
                statusStyle.bg, statusStyle.border
              )}>
                <MiniToothIcon cat={cat} status={status} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-stone-900 leading-none">#{fdi}</h2>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-400">{cat}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={cn("w-2 h-2 rounded-full", statusStyle.dot)} />
                  <span className={cn("text-xs font-medium", statusStyle.text)}>{statusStyle.label}</span>
                  {priority !== "MEDIUM" && (
                    <span className={cn(
                      "ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
                      priority === "EMERGENCY" ? "bg-red-50 text-red-700"
                        : priority === "HIGH" ? "bg-amber-50 text-amber-700"
                        : "bg-violet-50 text-violet-700"
                    )}>
                      {priority === "EMERGENCY" && <AlertTriangle className="w-2.5 h-2.5" />}
                      {priority.charAt(0) + priority.slice(1).toLowerCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="p-1.5 -m-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Tab bar */}
          <nav className="flex gap-1 mt-4 -mb-2" role="tablist">
            {([
              { key: "overview", label: "Overview", icon: <Activity className="w-3.5 h-3.5" /> },
              { key: "surfaces", label: "Surfaces", icon: <Layers className="w-3.5 h-3.5" /> },
              { key: "notes",    label: "Notes",    icon: <FileText className="w-3.5 h-3.5" /> },
            ] as const).map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[11px] font-semibold transition-all border-b-2 -mb-px",
                  tab === t.key
                    ? "text-blue-600 border-blue-500 bg-blue-50/60"
                    : "text-stone-500 border-transparent hover:text-stone-800 hover:bg-stone-50"
                )}
              >
                {t.icon}
                {t.label}
                {t.key === "surfaces" && Object.values(surfaces).filter(Boolean).length > 0 && (
                  <span className="ml-1 px-1.5 py-0 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold">
                    {Object.values(surfaces).filter(Boolean).length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </header>

        {/* ───── Body ───── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* OVERVIEW TAB */}
          {tab === "overview" && (
            <>
              {/* Status — compact inline pills */}
              <section style={stagger(1)}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-500">Status</label>
                  {status !== "HEALTHY" && (
                    <button
                      onClick={() => setStatus("HEALTHY")}
                      className="text-[10px] text-stone-400 hover:text-stone-700 font-medium"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {STATUSES.map((s) => {
                    const style = STATUS_STYLES[s];
                    const active = status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setStatus(s)}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-semibold transition-all",
                          active
                            ? `${style.border} ${style.bg} ${style.text} shadow-sm scale-[1.03]`
                            : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:bg-stone-50"
                        )}
                      >
                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", style.dot)} />
                        {style.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Priority — compact inline pills */}
              <section style={stagger(2)}>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5 block">Priority</label>
                <div className="flex gap-1">
                  {(["EMERGENCY", "HIGH", "MEDIUM", "COSMETIC"] as const).map((p) => {
                    const active = priority === p;
                    const palette =
                      p === "EMERGENCY" ? "border-red-300 bg-red-50 text-red-700"
                      : p === "HIGH"    ? "border-amber-300 bg-amber-50 text-amber-700"
                      : p === "MEDIUM"  ? "border-blue-300 bg-blue-50 text-blue-700"
                      :                   "border-violet-300 bg-violet-50 text-violet-700";
                    const dot =
                      p === "EMERGENCY" ? "bg-red-500"
                      : p === "HIGH"    ? "bg-amber-500"
                      : p === "MEDIUM"  ? "bg-blue-500"
                      :                   "bg-violet-500";
                    return (
                      <button
                        key={p}
                        onClick={() => setPriority(p)}
                        className={cn(
                          "flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold transition-all",
                          active ? palette + " shadow-sm" : "border-stone-200 bg-white text-stone-400 hover:border-stone-300"
                        )}
                      >
                        <span className={cn("w-1.5 h-1.5 rounded-full", active ? dot : "bg-stone-300")} />
                        {p.charAt(0) + p.slice(1).toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              </section>

              <div style={stagger(3)}>
                <ChipField
                  label="Conditions"
                  accentClass="rose"
                  values={parseChips(conditions)}
                  onChange={(chips) => setConditions(joinChips(chips))}
                  suggestions={CONDITION_CHIPS}
                  placeholder="Type or pick…"
                />
              </div>

              <div style={stagger(4)}>
                <ChipField
                  label="Planned Treatment"
                  accentClass="cyan"
                  values={parseChips(plannedTreatment)}
                  onChange={(chips) => setPlannedTreatment(joinChips(chips))}
                  suggestions={instantSuggestions}
                  instantBadge="Smart"
                  placeholder="Add procedure to plan…"
                  showAiButton={!!patientIdForAi}
                  onAskAi={onAskAi}
                  aiLoading={aiLoading}
                />
              </div>

              <div style={stagger(5)}>
                <ChipField
                  label="Completed Treatment"
                  accentClass="emerald"
                  values={parseChips(completedTreatment)}
                  onChange={(chips) => setCompletedTreatment(joinChips(chips))}
                  suggestions={TREATMENT_CHIPS.slice(0, 12)}
                  placeholder="Add finished procedure…"
                />
              </div>

              {/* AI suggestions surface — staggered entry */}
              {aiSuggestions.length > 0 && (
                <section
                  style={stagger(6)}
                  className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50/60 p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-500" />
                    <span className="text-[11px] uppercase tracking-wider font-bold text-violet-700">AI Treatment Suggestions</span>
                  </div>
                  <div className="space-y-1.5">
                    {aiSuggestions.slice(0, 3).map((s, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const current = parseChips(plannedTreatment);
                          if (!current.includes(s.treatment)) {
                            setPlannedTreatment(joinChips([...current, s.treatment]));
                          }
                        }}
                        className="w-full text-left bg-white/80 hover:bg-white border border-violet-200 hover:border-violet-300 rounded-xl px-3 py-2 transition-all group hover:shadow-md hover:-translate-y-px"
                      >
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-xs font-bold text-stone-900">{s.treatment}</span>
                          <div className="flex items-center gap-1.5">
                            {s.cdtCode && <span className="text-[9px] font-mono text-stone-400">{s.cdtCode}</span>}
                            <span className={cn(
                              "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                              s.urgency === "EMERGENCY" ? "bg-red-100 text-red-700"
                              : s.urgency === "URGENT" ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                            )}>{s.urgency}</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-stone-600 leading-tight">{s.rationale}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[9px] text-stone-400">{s.estimatedVisits} visit{s.estimatedVisits === 1 ? "" : "s"} · {Math.round(s.confidence * 100)}% confidence</span>
                          <Plus className="w-3 h-3 text-violet-400 group-hover:text-violet-600 transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* SURFACES TAB */}
          {tab === "surfaces" && (
            <>
              {/* Mini-tooth surface picker — anatomical, category-specific */}
              <section style={stagger(1)} className="flex flex-col items-center pb-1">
                <div className="text-center mb-3">
                  <div className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">Occlusal View</div>
                  <div className="text-[10px] text-stone-500 mt-0.5">Tap a surface to edit</div>
                </div>
                <SurfacePicker
                  cat={cat}
                  arch={fdi >= 30 && fdi <= 48 || fdi >= 70 ? "lower" : "upper"}
                  surfaces={surfaces}
                  status={status}
                  active={activeSurface}
                  onSelect={(s) => setActiveSurface(s)}
                />
                {/* Surface chip strip below the diagram */}
                <div className="flex gap-1.5 mt-4">
                  {SURFACE_CHIPS.map((c) => {
                    const has = surfaceHasData(c.key);
                    const active = activeSurface === c.key;
                    return (
                      <button
                        key={c.key}
                        onClick={() => setActiveSurface(c.key)}
                        className={cn(
                          "group relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all",
                          active && "bg-blue-50 ring-2 ring-blue-400 ring-offset-1 ring-offset-white scale-[1.04]"
                        )}
                        title={c.label}
                      >
                        <span className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold transition-all",
                          active ? "bg-blue-600 text-white shadow-md"
                          : has ? "bg-stone-800 text-white"
                          : "bg-stone-100 text-stone-500 group-hover:bg-stone-200"
                        )}>
                          {c.short}
                        </span>
                        <span className={cn(
                          "text-[8px] font-semibold uppercase tracking-wider transition-colors",
                          active ? "text-blue-700"
                          : has ? "text-stone-700"
                          : "text-stone-400"
                        )}>
                          {c.label.replace(/\s*\(.*\)/, "")}
                        </span>
                        {has && !active && (
                          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 ring-2 ring-white" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Surface editor — appears when a surface is selected */}
              {activeSurface && (
                <section
                  style={stagger(2)}
                  className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50/60 to-cyan-50/30 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shadow-md">
                        {SURFACE_CHIPS.find((c) => c.key === activeSurface)?.short}
                      </span>
                      <span className="leading-tight">
                        {SURFACE_CHIPS.find((c) => c.key === activeSurface)?.label}
                        <span className="block text-[10px] font-medium text-stone-500">surface · tooth #{fdi}</span>
                      </span>
                    </h3>
                    {surfaceHasData(activeSurface) && (
                      <button
                        onClick={() => setSurfaces((prev) => {
                          const next = { ...prev };
                          delete next[activeSurface];
                          return next;
                        })}
                        className="text-[10px] text-red-500 hover:text-red-700 font-semibold flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded-md transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Clear
                      </button>
                    )}
                  </div>

                  {/* Chip-based inputs */}
                  <ChipField
                    label="Condition"
                    accentClass="rose"
                    values={parseChips(surfaces[activeSurface]?.condition ?? "")}
                    onChange={(chips) => updateSurface(activeSurface, "condition", joinChips(chips))}
                    suggestions={CONDITION_CHIPS}
                    placeholder="Cavity, Sensitivity…"
                  />

                  <ChipField
                    label="Planned"
                    accentClass="cyan"
                    values={parseChips(surfaces[activeSurface]?.plannedTreatment ?? "")}
                    onChange={(chips) => updateSurface(activeSurface, "plannedTreatment", joinChips(chips))}
                    suggestions={TREATMENT_CHIPS.slice(0, 10)}
                    placeholder="Procedure to plan…"
                  />

                  <ChipField
                    label="Completed"
                    accentClass="emerald"
                    values={parseChips(surfaces[activeSurface]?.completedTreatment ?? "")}
                    onChange={(chips) => updateSurface(activeSurface, "completedTreatment", joinChips(chips))}
                    suggestions={TREATMENT_CHIPS.slice(0, 8)}
                    placeholder="Finished procedure…"
                  />

                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5 block">
                      Notes
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Optional notes for this surface…"
                      value={surfaces[activeSurface]?.notes ?? ""}
                      onChange={(e) => updateSurface(activeSurface, "notes", e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none bg-white placeholder:text-stone-400 resize-none"
                    />
                  </div>
                </section>
              )}

              {!activeSurface && (
                <div
                  style={stagger(2)}
                  className="rounded-2xl border-2 border-dashed border-stone-200 p-6 text-center"
                >
                  <Layers className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                  <p className="text-xs text-stone-500 font-medium">
                    Pick a surface above to mark its condition
                  </p>
                  <p className="text-[10px] text-stone-400 mt-1">
                    M · Mesial   D · Distal   O · Occlusal   B · Buccal   L · Lingual
                  </p>
                </div>
              )}
            </>
          )}

          {/* NOTES TAB */}
          {tab === "notes" && (
            <>
              <section>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2 block">
                  Tooth Notes
                </label>
                <textarea
                  rows={5}
                  placeholder="Patient-history relevant notes for this tooth — symptoms, observations, treatment rationale…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border-2 border-stone-200 focus:border-blue-400 focus:outline-none placeholder:text-stone-400 resize-none"
                />
              </section>
              <div className="text-[10px] text-stone-400 leading-relaxed">
                Notes are saved with the tooth record. Audit history (status changes, treatment events) is captured automatically and visible in the chart-level <strong>History</strong> panel.
              </div>
            </>
          )}

          {save.isError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {(save.error as Error).message}
            </div>
          )}
        </div>

        {/* ───── Footer ───── */}
        <footer className="shrink-0 border-t border-stone-100 p-3 flex items-center justify-between gap-2 bg-stone-50/60">
          <button
            onClick={() => reset.mutate()}
            disabled={reset.isPending || !existing}
            className="px-3 py-2 rounded-lg text-[11px] font-semibold text-stone-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-stone-500 transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Reset
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-stone-400 mr-1 hidden sm:inline">
              ⌘ Enter to save · Esc to close
            </span>
            <button
              onClick={handleClose}
              className="px-3 py-2 rounded-lg text-[11px] font-semibold text-stone-600 hover:bg-stone-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="px-4 py-2 rounded-lg text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              {save.isPending ? "Saving…" : "Save tooth"}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

/**
 * Chip-based input field with suggestion chips beneath.
 * - Type + Enter (or comma) adds a chip.
 * - Backspace on empty input deletes the last chip.
 * - Click a suggestion chip below to add it.
 * - Stored as comma-separated string at the data layer for backward compat.
 *
 * Optional AI button on the right that triggers an LLM call (when patientId
 * is available).
 */
function ChipField({
  label,
  accentClass,
  values,
  onChange,
  suggestions,
  placeholder,
  instantBadge,
  showAiButton,
  onAskAi,
  aiLoading,
}: {
  label: string;
  accentClass: "rose" | "cyan" | "emerald" | "stone" | "violet";
  values: string[];
  onChange: (chips: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  instantBadge?: string;
  showAiButton?: boolean;
  onAskAi?: () => void;
  aiLoading?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const palette: Record<typeof accentClass, { border: string; bg: string; chip: string; label: string; dot: string }> = {
    rose:    { border: "border-rose-200",    bg: "bg-rose-50/30",    chip: "bg-rose-100 text-rose-800 border-rose-200",       label: "text-rose-700",    dot: "bg-rose-500" },
    cyan:    { border: "border-cyan-200",    bg: "bg-cyan-50/30",    chip: "bg-cyan-100 text-cyan-800 border-cyan-200",       label: "text-cyan-700",    dot: "bg-cyan-500" },
    emerald: { border: "border-emerald-200", bg: "bg-emerald-50/30", chip: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "text-emerald-700", dot: "bg-emerald-500" },
    stone:   { border: "border-stone-200",   bg: "bg-white",         chip: "bg-stone-100 text-stone-700 border-stone-200",     label: "text-stone-700",   dot: "bg-stone-500" },
    violet:  { border: "border-violet-200",  bg: "bg-violet-50/30",  chip: "bg-violet-100 text-violet-800 border-violet-200",  label: "text-violet-700",  dot: "bg-violet-500" },
  };
  const accent = palette[accentClass];

  function addChip(value: string) {
    const v = value.trim();
    if (!v || values.includes(v)) { setDraft(""); return; }
    onChange([...values, v]);
    setDraft("");
  }
  function removeChip(value: string) {
    onChange(values.filter((v) => v !== value));
  }

  const visibleSuggestions = suggestions.filter((s) => !values.includes(s)).slice(0, 8);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className={cn("text-xs font-bold uppercase tracking-wider flex items-center gap-1.5", accent.label)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", accent.dot)} />
          {label}
          {instantBadge && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-[8px] font-bold uppercase bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded">
              <Zap className="w-2 h-2" /> {instantBadge}
            </span>
          )}
        </label>
        {showAiButton && (
          <button
            onClick={onAskAi}
            disabled={aiLoading}
            className={cn(
              "text-[10px] font-bold flex items-center gap-1 px-2 py-1 rounded-md transition-all",
              "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white",
              "hover:shadow-md hover:scale-[1.04] active:scale-[0.98]",
              "disabled:opacity-60 disabled:hover:scale-100"
            )}
          >
            <Sparkles className={cn("w-3 h-3", aiLoading && "animate-spin")} />
            {aiLoading ? "Thinking…" : "Ask AI"}
          </button>
        )}
      </div>

      {/* Input + chip area */}
      <div className={cn(
        "rounded-xl border-2 px-2 py-2 transition-all",
        accent.border, accent.bg,
        "focus-within:border-stone-500 focus-within:bg-white focus-within:shadow-sm"
      )}>
        <div className="flex flex-wrap gap-1.5 items-center">
          {values.map((v) => (
            <span
              key={v}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-all",
                accent.chip
              )}
              style={{
                animation: "chipPop 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              {v}
              <button
                onClick={() => removeChip(v)}
                className="hover:bg-black/10 rounded-full p-0.5 -mr-1 transition-colors"
                aria-label={`Remove ${v}`}
              >
                <XIcon className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addChip(draft);
              } else if (e.key === "Backspace" && !draft && values.length > 0) {
                e.preventDefault();
                removeChip(values[values.length - 1]);
              }
            }}
            placeholder={values.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[100px] px-1 py-0.5 text-[12px] bg-transparent focus:outline-none placeholder:text-stone-400"
          />
        </div>
      </div>

      {/* Suggestion chips below */}
      {visibleSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {visibleSuggestions.map((s) => (
            <button
              key={s}
              onClick={() => addChip(s)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 border border-transparent hover:border-stone-300 transition-all hover:-translate-y-px hover:shadow-sm active:scale-95"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Mini tooth icon for the panel header. Small SVG of the tooth category.
 */
function MiniToothIcon({ cat, status }: { cat: ToothCategory; status: ToothStatus }) {
  const fill = status !== "HEALTHY" ? `url(#g-${status})` : "url(#tooth-pearl)";
  // Inline the gradient defs since this SVG isn't inside ArchView's defs.
  return (
    <svg viewBox="0 0 24 24" className="w-7 h-7">
      <defs>
        <linearGradient id="mini-pearl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e7e5e4" />
        </linearGradient>
      </defs>
      {cat === "incisor" || cat === "canine" ? (
        <path
          d="M 12 3 Q 18 4 18 12 Q 18 19 12 21 Q 6 19 6 12 Q 6 4 12 3 Z"
          fill={status === "HEALTHY" ? "url(#mini-pearl)" : fill}
          stroke="#475569"
          strokeWidth="1"
        />
      ) : (
        <rect
          x="4"
          y="4"
          width="16"
          height="16"
          rx={cat === "premolar" ? 4 : 3}
          fill={status === "HEALTHY" ? "url(#mini-pearl)" : fill}
          stroke="#475569"
          strokeWidth="1"
        />
      )}
      {(cat === "molar" || cat === "premolar") && (
        <g stroke="#94a3b8" strokeWidth="0.6" opacity="0.7">
          <line x1="12" y1="6" x2="12" y2="18" />
          <line x1="6" y1="12" x2="18" y2="12" />
        </g>
      )}
    </svg>
  );
}

/**
 * Visual surface picker — refined mini-tooth diagram for the Surfaces tab.
 *
 * Renders the chewing surface of the tooth viewed from the occlusal
 * direction, with the 5 clinical surfaces (M / D / O / B / L) arranged
 * around the centre.  Category-specific anatomical detail:
 *  - Incisor / canine: leaf-shaped outline, simple cross
 *  - Premolar:   "+" pit pattern + 2 visible cusps
 *  - Molar:      4-cusp grid with developmental grooves
 */
function SurfacePicker({
  cat, arch, surfaces, status, active, onSelect,
}: {
  cat: ToothCategory;
  arch: "upper" | "lower";
  surfaces: Partial<Record<Surface, SurfaceData>>;
  status: ToothStatus;
  active: Surface | null;
  onSelect: (s: Surface) => void;
}) {
  const w = 200;
  const h = 200;
  const cw = w / 3;
  const ch = h / 3;
  const surfaceFor = (s: Surface) => {
    const d = surfaces[s];
    return surfaceFill(status, d);
  };
  const cells: Array<{ s: Surface; x: number; y: number; w: number; h: number; label: string }> = [
    { s: "buccal",   x: cw,     y: 0,        w: cw, h: ch, label: "B" },
    { s: "lingual",  x: cw,     y: 2 * ch,   w: cw, h: ch, label: "L" },
    { s: "mesial",   x: 0,      y: ch,       w: cw, h: ch, label: "M" },
    { s: "distal",   x: 2 * cw, y: ch,       w: cw, h: ch, label: "D" },
    { s: "occlusal", x: cw,     y: ch,       w: cw, h: ch, label: "O" },
  ];
  return (
    <div className="relative">
      {/* Subtle backdrop ring */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-stone-50 to-stone-100/60 blur-2xl scale-110 pointer-events-none" />

      <svg viewBox={`-12 -12 ${w + 24} ${h + 24}`} width="220" height="220" className="relative select-none">
        <defs>
          {/* Soft pearl base for the whole tooth */}
          <radialGradient id="sp-pearl" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#faf7f1" />
            <stop offset="100%" stopColor="#ece6d8" />
          </radialGradient>
          {/* Sophisticated drop shadow for the tooth outline */}
          <filter id="sp-shadow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="2" result="shadow" />
            <feComponentTransfer><feFuncA type="linear" slope="0.25" /></feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Glow for active cell */}
          <filter id="sp-cell-glow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" />
            <feFlood floodColor="#3b82f6" floodOpacity="0.35" result="color" />
            <feComposite in="color" in2="SourceAlpha" operator="in" result="shadow" />
            <feMerge><feMergeNode in="shadow" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Outer tooth outline — category-specific */}
        <g filter="url(#sp-shadow)">
          {cat === "incisor" || cat === "canine" ? (
            <path
              d={`M ${w / 2} 0 Q ${w + 10} 6 ${w} ${h * 0.45} Q ${w} ${h - 6} ${w / 2} ${h} Q 0 ${h - 6} 0 ${h * 0.45} Q -10 6 ${w / 2} 0 Z`}
              fill="url(#sp-pearl)"
              stroke="#a8a29e"
              strokeWidth="2"
            />
          ) : (
            <rect x={0} y={0} width={w} height={h} rx={cat === "premolar" ? 24 : 18} fill="url(#sp-pearl)" stroke="#a8a29e" strokeWidth="2" />
          )}
        </g>

        {/* Anatomical detail — drawn behind the surface cells */}
        {cat === "premolar" && (
          <g pointerEvents="none" opacity={0.4}>
            <line x1={w / 2} y1={h * 0.32} x2={w / 2} y2={h * 0.68} stroke="#a8a29e" strokeWidth="1.2" />
            <line x1={w * 0.32} y1={h / 2} x2={w * 0.68} y2={h / 2} stroke="#a8a29e" strokeWidth="1.2" />
            <circle cx={w / 2} cy={h / 2} r={3} fill="#a8a29e" opacity={0.5} />
          </g>
        )}
        {cat === "molar" && (
          <g pointerEvents="none" opacity={0.4}>
            {arch === "upper" ? (
              <>
                <path d={`M ${w / 2} ${h * 0.5} L ${w * 0.28} ${h * 0.2}`} stroke="#a8a29e" strokeWidth="1.2" fill="none" />
                <path d={`M ${w / 2} ${h * 0.5} L ${w * 0.72} ${h * 0.2}`} stroke="#a8a29e" strokeWidth="1.2" fill="none" />
                <path d={`M ${w / 2} ${h * 0.5} L ${w / 2} ${h * 0.85}`} stroke="#a8a29e" strokeWidth="1.2" fill="none" />
              </>
            ) : (
              <>
                <line x1={w / 2} y1={h * 0.18} x2={w / 2} y2={h * 0.82} stroke="#a8a29e" strokeWidth="1.2" />
                <line x1={w * 0.18} y1={h / 2} x2={w * 0.82} y2={h / 2} stroke="#a8a29e" strokeWidth="1.2" />
              </>
            )}
            {/* Cusp dots */}
            <g fill="#a8a29e" opacity={0.5}>
              <circle cx={w * 0.28} cy={h * 0.3} r={3.5} />
              <circle cx={w * 0.72} cy={h * 0.3} r={3.5} />
              <circle cx={w * 0.28} cy={h * 0.7} r={3.5} />
              <circle cx={w * 0.72} cy={h * 0.7} r={3.5} />
            </g>
          </g>
        )}
        {(cat === "incisor" || cat === "canine") && (
          <g pointerEvents="none" opacity={0.35}>
            <path d={`M ${w * 0.2} ${h * 0.82} Q ${w / 2} ${h - 4} ${w * 0.8} ${h * 0.82}`} stroke="#a8a29e" strokeWidth="1.2" fill="none" />
          </g>
        )}

        {/* Surface cells */}
        {cells.map(({ s, x, y, w: cellW, h: cellH, label }) => {
          const data = surfaces[s];
          const hasData = !!(data?.condition || data?.completedTreatment || data?.plannedTreatment);
          const isActive = active === s;
          const { fill, stroke } = surfaceFor(s);
          return (
            <g key={s} onClick={() => onSelect(s)} style={{ cursor: "pointer" }}>
              <rect
                x={x + 5}
                y={y + 5}
                width={cellW - 10}
                height={cellH - 10}
                rx={8}
                fill={hasData ? fill : isActive ? "#dbeafe" : "rgba(255,255,255,0.55)"}
                stroke={isActive ? "#2563eb" : hasData ? stroke : "rgba(168,162,158,0.4)"}
                strokeWidth={isActive ? 2.5 : hasData ? 1.5 : 1}
                opacity={hasData ? 0.92 : 1}
                filter={isActive ? "url(#sp-cell-glow)" : undefined}
                style={{ transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)" }}
              />
              <text
                x={x + cellW / 2}
                y={y + cellH / 2 + 6}
                textAnchor="middle"
                fontSize={isActive ? 20 : hasData ? 18 : 17}
                fontWeight={800}
                fill={hasData ? "#0f172a" : isActive ? "#1d4ed8" : "#a8a29e"}
                pointerEvents="none"
                style={{ transition: "all 0.18s ease" }}
              >
                {label}
              </text>
              {hasData && (
                <circle
                  cx={x + cellW - 10}
                  cy={y + 10}
                  r={3.5}
                  fill="#3b82f6"
                  stroke="white"
                  strokeWidth="1.5"
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}

        {/* Inner glow on hover/active for the central occlusal cell */}
        {active === "occlusal" && (
          <rect
            x={cw + 5}
            y={ch + 5}
            width={cw - 10}
            height={ch - 10}
            rx={8}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2.5}
            strokeDasharray="3 4"
            opacity={0.6}
            pointerEvents="none"
          />
        )}
      </svg>
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
