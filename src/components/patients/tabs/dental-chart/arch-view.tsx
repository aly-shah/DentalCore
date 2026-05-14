"use client";

/**
 * Modern U-shaped dental arch view — maxillary on top, mandibular on
 * bottom, with each tooth rendered at its anatomical position around
 * the arch ellipse. Hover shows a floating info card with surface-level
 * conditions and planned/completed treatments.
 *
 * Extracted from dental-chart-tab.tsx.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  effectiveStatus,
  STATUS_STYLES,
  surfaceFill,
  toothCategory,
  UNIVERSAL_MAP,
  type Surface,
  type SurfaceData,
  type ToothRecord,
  type ToothStatus,
} from "./types";

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

export function ArchView({ dentition, teethByFdi, selectedFdi, numbering, onClickTooth, onClickSurface, quickMark, onQuickMark }: ArchViewProps) {
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
    const rotation = deg + 90;
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

/* ─────────────────────────────────────────────────────────── */

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
  const rightRect     = { x: 2 * cellW, y: cellH, w: cellW, h: cellH };
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
