"use client";

/**
 * ToothSVG — per-tooth anatomical SVG used by the Classic chart view.
 * Two-view (side + occlusal) layout matching paper dental-chart layout,
 * with a clickable 5-surface cross overlay.
 *
 * Extracted from dental-chart-tab.tsx.
 */
import { cn } from "@/lib/utils";
import {
  STATUS_STYLES,
  surfaceFill,
  toothCategory,
  type Surface,
  type SurfaceData,
  type ToothCategory,
  type ToothStatus,
} from "./types";

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
export function ToothSVG({ fdi, arch, status, surfaces, selected, label, onClickTooth, onClickSurface }: ToothSVGProps) {
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
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        width={VB_W * 0.7}
        height={VB_H * 0.7}
        className="overflow-visible block"
      >
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
