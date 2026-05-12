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
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width={VB_W * 1.4} height={VB_H * 1.4} className="overflow-visible">
        {/* ────── Side view (anatomical) ────── */}
        <g transform={`translate(${(VB_W - sideW) / 2}, ${sideTop})`}>
          <path
            d={sideCrownPath}
            fill="white"
            stroke="#16a34a"
            strokeWidth={0.9}
            strokeLinejoin="round"
          />
          {/* Buccal status indicator on side view: paint a subtle fill if status is non-healthy */}
          {!missing && status !== "HEALTHY" && (
            <path
              d={sideCrownPath}
              fill={surfaceFill(status, undefined).fill}
              opacity={0.4}
              pointerEvents="none"
            />
          )}
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
          fill="white"
          stroke="#16a34a"
          strokeWidth={0.9}
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
        fill="white"
        stroke="#16a34a"
        strokeWidth={0.9}
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
          {/* Background — subtle radial vignette suggesting depth into mouth */}
          <radialGradient id="arch-bg" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="#fafafa" />
            <stop offset="70%" stopColor="#f4f4f5" />
            <stop offset="100%" stopColor="#e7e5e4" />
          </radialGradient>

          {/* Pearl-white tooth gradient (used for healthy default) */}
          <linearGradient id="tooth-pearl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#fafafa" />
            <stop offset="100%" stopColor="#e7e5e4" />
          </linearGradient>

          {/* Status gradients */}
          <linearGradient id="g-CARIES" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fecdd3" /><stop offset="100%" stopColor="#fb7185" />
          </linearGradient>
          <linearGradient id="g-FILLING" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fef3c7" /><stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
          <linearGradient id="g-CROWN" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fef08a" /><stop offset="100%" stopColor="#eab308" />
          </linearGradient>
          <linearGradient id="g-BRIDGE" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fed7aa" /><stop offset="100%" stopColor="#f97316" />
          </linearGradient>
          <linearGradient id="g-IMPLANT" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dbeafe" /><stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="g-ROOT_CANAL" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e9d5ff" /><stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id="g-EXTRACTION_NEEDED" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fecaca" /><stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
          <linearGradient id="g-MOBILITY" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbcfe8" /><stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
          <linearGradient id="g-FRACTURE" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ddd6fe" /><stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="g-UNDER_TREATMENT" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#cffafe" /><stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <linearGradient id="g-TREATED" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d1fae5" /><stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <linearGradient id="g-MISSING" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e7e5e4" /><stop offset="100%" stopColor="#a8a29e" />
          </linearGradient>
          <linearGradient id="g-PROBLEM" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fecdd3" /><stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>

          {/* Soft drop shadow filter */}
          <filter id="tooth-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="0.8" />
            <feOffset dx="0" dy="0.6" result="shadow" />
            <feComponentTransfer><feFuncA type="linear" slope="0.35" /></feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Stronger glow for hover/selected */}
          <filter id="tooth-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" />
            <feOffset dx="0" dy="0" result="shadow" />
            <feComponentTransfer><feFuncA type="linear" slope="0.5" /></feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Background plate */}
        <rect x={0} y={0} width={VB_W} height={VB_H} fill="url(#arch-bg)" rx={20} />

        {/* Inner mouth vignette (subtle oval suggesting the palate / tongue area) */}
        <ellipse cx={VB_W / 2} cy={VB_H / 2} rx={150} ry={110} fill="#fafafa" opacity={0.4} />

        {/* Arch guides (faint dashed) */}
        <path d={archGuide(maxCx, maxCy, maxRx, maxRy, false)} fill="none" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />
        <path d={archGuide(manCx, manCy, manRx, manRy, true)} fill="none" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />

        {/* Midline */}
        <line x1={VB_W / 2} y1={32} x2={VB_W / 2} y2={VB_H - 32} stroke="#cbd5e1" strokeWidth={0.6} strokeDasharray="3 4" opacity={0.4} />

        {/* Axis labels */}
        <text x={VB_W / 2} y={20} fontSize={10} fontWeight={700} textAnchor="middle" fill="#94a3b8" letterSpacing="3">UPPER</text>
        <text x={VB_W / 2} y={VB_H - 8} fontSize={10} fontWeight={700} textAnchor="middle" fill="#94a3b8" letterSpacing="3">LOWER</text>
        <text x={20} y={VB_H / 2 + 4} fontSize={10} fontWeight={700} textAnchor="start" fill="#94a3b8" letterSpacing="3">RIGHT</text>
        <text x={VB_W - 20} y={VB_H / 2 + 4} fontSize={10} fontWeight={700} textAnchor="end" fill="#94a3b8" letterSpacing="3">LEFT</text>

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
      {hoveredFdi !== null && (
        <div className="absolute top-3 right-3 sm:top-5 sm:right-5 pointer-events-none">
          <div className="bg-white/95 backdrop-blur-sm border border-stone-200 rounded-xl shadow-lg px-3 py-2 min-w-[160px] animate-fade-in">
            <div className="flex items-center justify-between gap-3">
              <span className="text-lg font-bold text-stone-900">
                {numbering === "FDI" ? `#${hoveredFdi}` : `#${UNIVERSAL_MAP[hoveredFdi] ?? hoveredFdi}`}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-stone-400 font-semibold">
                {hoveredCat}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={cn("w-2 h-2 rounded-full", STATUS_STYLES[(hoveredTooth?.status ?? "HEALTHY") as ToothStatus].dot)} />
              <span className="text-[11px] font-medium text-stone-600">
                {STATUS_STYLES[(hoveredTooth?.status ?? "HEALTHY") as ToothStatus].label}
              </span>
            </div>
            {hoveredTooth?.plannedTreatment && (
              <p className="text-[10px] text-cyan-600 mt-1 leading-tight">
                Plan: {hoveredTooth.plannedTreatment}
              </p>
            )}
            {hoveredTooth?.completedTreatment && (
              <p className="text-[10px] text-emerald-600 mt-1 leading-tight">
                ✓ {hoveredTooth.completedTreatment}
              </p>
            )}
            {hoveredTooth && hoveredTooth.surfaces && Object.values(hoveredTooth.surfaces).filter(Boolean).length > 0 && (
              <p className="text-[10px] text-stone-400 mt-1">
                {Object.values(hoveredTooth.surfaces).filter(Boolean).length} surface{Object.values(hoveredTooth.surfaces).filter(Boolean).length === 1 ? "" : "s"} marked
              </p>
            )}
          </div>
        </div>
      )}
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
  const status = (tooth?.status ?? "HEALTHY") as ToothStatus;
  const missing = status === "MISSING";

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
    : hovered ? "#475569"
    : "#cbd5e1";
  const strokeWidth = selected ? 1.6 : hovered ? 1.3 : 1;

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

        {/* Anatomical hints */}
        {cat === "premolar" && !missing && (
          <g stroke="#94a3b8" strokeWidth={0.6} opacity={0.55} pointerEvents="none">
            <line x1={w / 2} y1={h * 0.28} x2={w / 2} y2={h * 0.72} />
            <line x1={w * 0.28} y1={h / 2} x2={w * 0.72} y2={h / 2} />
            <circle cx={w / 2} cy={h / 2} r={1.2} fill="#94a3b8" stroke="none" />
          </g>
        )}
        {cat === "molar" && !missing && (
          <g stroke="#94a3b8" strokeWidth={0.55} opacity={0.55} pointerEvents="none">
            <line x1={w / 2} y1={2} x2={w / 2} y2={h - 2} />
            <line x1={2} y1={h / 2} x2={w - 2} y2={h / 2} />
            {/* Cusp dots */}
            <circle cx={w * 0.25} cy={h * 0.3} r={1.4} fill="#94a3b8" stroke="none" />
            <circle cx={w * 0.75} cy={h * 0.3} r={1.4} fill="#94a3b8" stroke="none" />
            <circle cx={w * 0.25} cy={h * 0.7} r={1.4} fill="#94a3b8" stroke="none" />
            <circle cx={w * 0.75} cy={h * 0.7} r={1.4} fill="#94a3b8" stroke="none" />
          </g>
        )}
        {(cat === "incisor" || cat === "canine") && !missing && (
          <g stroke="#94a3b8" strokeWidth={0.55} opacity={0.4} pointerEvents="none">
            {/* Incisal edge highlight */}
            <path d={`M ${w * 0.2} ${h * 0.85} Q ${w / 2} ${h - 1} ${w * 0.8} ${h * 0.85}`} fill="none" />
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

        {/* Priority badge — small dot top-right for non-MEDIUM priorities */}
        {tooth?.priority && tooth.priority !== "MEDIUM" && !missing && (
          <circle
            cx={w - 2}
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

          {/* Compact inline legend */}
          <div className="flex flex-wrap gap-2 text-[10px] text-stone-600 px-1">
            {STATUSES.filter((s) => s !== "HEALTHY" && s !== "PROBLEM" && s !== "UNDER_TREATMENT" && s !== "TREATED").map((s) => (
              <div key={s} className="flex items-center gap-1">
                <span className={cn("w-2.5 h-2.5 rounded-full", STATUS_STYLES[s].dot)} />
                <span>{STATUS_STYLES[s].label}</span>
              </div>
            ))}
          </div>
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
