"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Smile, Filter, Trash2, X as XIcon, ArrowLeft, Copy, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/components/ui/loading";
import { cn } from "@/lib/utils";

type ToothStatus = "PROBLEM" | "UNDER_TREATMENT" | "TREATED" | "MISSING";

interface ToothRecord {
  id: string;
  patientId: string;
  fdi: number;
  status: ToothStatus;
  conditions: string | null;
  treatment: string | null;
  notes: string | null;
  updatedAt: string;
}

const CONDITIONS = [
  "Cavity",
  "Fracture",
  "Infection",
  "Discoloration",
  "Sensitivity",
  "Plaque/Tartar",
  "Gum Disease",
  "Wear",
  "Chipped",
  "Impacted",
];

const TREATMENTS = [
  "",
  "Filling",
  "Root Canal",
  "Crown",
  "Extraction",
  "Bridge",
  "Implant",
  "Cleaning",
  "Whitening",
  "Veneer",
  "Sealant",
  "Bonding",
];

const STATUS_LABEL: Record<ToothStatus, string> = {
  PROBLEM: "Problem",
  UNDER_TREATMENT: "Under treatment",
  TREATED: "Treated",
  MISSING: "Missing",
};

const STATUS_STYLES: Record<ToothStatus, string> = {
  PROBLEM: "bg-red-100 border-red-400 text-red-700 hover:bg-red-200",
  UNDER_TREATMENT:
    "bg-amber-100 border-amber-400 text-amber-700 hover:bg-amber-200",
  TREATED:
    "bg-emerald-100 border-emerald-500 text-emerald-700 hover:bg-emerald-200",
  MISSING:
    "bg-stone-200 border-stone-400 text-stone-400 hover:bg-stone-300 line-through",
};

const STATUS_DOT: Record<ToothStatus, string> = {
  PROBLEM: "bg-red-500",
  UNDER_TREATMENT: "bg-amber-500",
  TREATED: "bg-emerald-500",
  MISSING: "bg-stone-500",
};

function parseConditions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v.map(String);
  } catch {
    /* fall through */
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// ---------- Dental Chart (paper-style grid: buccal + occlusal views) ----------

// Column order across the chart: 8 patient-RIGHT teeth, then 8 patient-LEFT teeth.
const UPPER_BY_COL = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_BY_COL = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const COL_W = 46; // width of one tooth column
const MID_GAP = 64; // extra space between col 7 and col 8 (for the UPPER / LINGUAL / LOWER labels)
const SIDE_PAD = 60; // left / right margin (for the RIGHT / LEFT labels)
const GRID_W = SIDE_PAD * 2 + 16 * COL_W + MID_GAP; // width of the permanent-teeth grid

const H_BUCCAL = 82; // height of a buccal-view (crown + roots) cell
const H_OCCL = 38; // height of an occlusal-view cell
const Y_NUM_TOP = 16; // upper FDI label baseline
const Y_UB = 28; // upper buccal cell — top
const Y_UO = Y_UB + H_BUCCAL + 2; // upper occlusal cell — top
const Y_MID = Y_UO + H_OCCL + 12; // the LINGUAL divider line
const Y_LO = Y_MID + 12; // lower occlusal cell — top
const Y_LB = Y_LO + H_OCCL + 2; // lower buccal cell — top
const Y_NUM_BOT = Y_LB + H_BUCCAL + 16; // lower FDI label baseline
const VB_H = Y_NUM_BOT + 8;
const MID_X = SIDE_PAD + 8 * COL_W + MID_GAP / 2;

// --- deciduous (primary teeth) oval chart, to the right of the main grid ---
const DEC_GAP = 36;
const DEC_RX = 92;
const DEC_RY = 116;
const DEC_W = DEC_RX * 2 + 96; // includes room for the a–e and R/L labels
const DEC_CX = GRID_W + DEC_GAP + DEC_W / 2;
const DEC_CY = VB_H / 2;
const VB_W = GRID_W + DEC_GAP + DEC_W;

const PRIMARY_LETTERS = ["a", "b", "c", "d", "e"];
// 20 primary teeth around the oval, clockwise from the top:
// Q6 (upper-left) → Q7 (lower-left) → Q8 (lower-right) → Q5 (upper-right)
const DEC_TEETH: { fdi: number; theta: number }[] = (() => {
  const out: { fdi: number; theta: number }[] = [];
  const quads: { fdis: number[]; start: number }[] = [
    { fdis: [61, 62, 63, 64, 65], start: 0 },
    { fdis: [75, 74, 73, 72, 71], start: 90 },
    { fdis: [81, 82, 83, 84, 85], start: 180 },
    { fdis: [55, 54, 53, 52, 51], start: 270 },
  ];
  for (const q of quads) {
    q.fdis.forEach((fdi, i) => {
      out.push({ fdi, theta: ((q.start + (i + 0.5) * 18) * Math.PI) / 180 });
    });
  }
  return out;
})();

function colX(c: number): number {
  return SIDE_PAD + c * COL_W + (c >= 8 ? MID_GAP : 0) + COL_W / 2;
}

function toothType(fdi: number): "incisor" | "canine" | "premolar" | "molar" {
  const d = fdi % 10;
  if (d === 1 || d === 2) return "incisor";
  if (d === 3) return "canine";
  if (d === 4 || d === 5) return "premolar";
  return "molar";
}
type ToothKind = ReturnType<typeof toothType>;

function crownWidth(kind: ToothKind, fdi: number): number {
  if (kind === "molar") return 38;
  if (kind === "premolar") return 30;
  if (kind === "canine") return 28;
  return fdi % 10 === 1 ? 26 : 22; // central vs lateral incisor
}

// --- Buccal (side) view: a single continuous outline (crown + roots).
//     Local box: x ∈ [-cw/2, cw/2], y ∈ [0, H_BUCCAL]. Occlusal/incisal edge near y = H_BUCCAL,
//     root tip(s) near y ≈ 6, cervical (gum) line at y = CERV_Y. ---
const CERV_Y = H_BUCCAL * 0.5; // cervical (gum) line
const OCC_TOP_Y = H_BUCCAL - 9; // crown's occlusal "shoulders"

function buccalToothPath(kind: ToothKind, cw: number, isUpper: boolean): string {
  const yOccTop = OCC_TOP_Y;
  const yOcc = H_BUCCAL - 1; // lowest point of the occlusal edge
  const yCerv = CERV_Y;
  const yTip = 6; // root tip(s)
  const mid = (yOccTop + yCerv) / 2;
  const rootMid = (yCerv + yTip) * 0.58;
  const oh =
    kind === "molar" ? cw * 0.48 : kind === "premolar" ? cw * 0.46 : kind === "canine" ? cw * 0.4 : cw * 0.48;
  const nh =
    kind === "molar" ? cw * 0.38 : kind === "premolar" ? cw * 0.32 : kind === "canine" ? cw * 0.26 : cw * 0.32;
  const nRoots = kind === "molar" ? (isUpper ? 3 : 2) : 1;

  // occlusal edge: continues from (-oh, yOccTop) to (oh, yOccTop)
  let occ: string;
  if (kind === "canine") {
    const sh = yOccTop + (yOcc - yOccTop) * 0.5;
    occ = `L ${-oh * 0.45} ${sh} L 0 ${yOcc + 2} L ${oh * 0.45} ${sh} L ${oh} ${yOccTop} `;
  } else if (kind === "premolar") {
    const vy = yOccTop + (yOcc - yOccTop) * 0.5;
    occ = `Q ${-oh * 0.52} ${yOcc + 1} 0 ${vy} Q ${oh * 0.52} ${yOcc + 1} ${oh} ${yOccTop} `;
  } else if (kind === "molar") {
    const vy = yOccTop + (yOcc - yOccTop) * 0.55;
    occ =
      `Q ${-oh * 0.6} ${yOcc + 1} ${-oh * 0.27} ${vy} ` +
      `Q 0 ${yOcc + 1} ${oh * 0.3} ${vy} ` +
      `Q ${oh * 0.62} ${yOcc + 1} ${oh} ${yOccTop} `;
  } else {
    occ = `Q 0 ${yOcc} ${oh} ${yOccTop} `; // incisor: a flattish rounded incisal edge
  }

  // crown sides
  const rightCrown = `C ${oh + 1.5} ${mid} ${nh + (oh - nh) * 0.3} ${yCerv + 5} ${nh} ${yCerv} `;
  const leftCrown = `C ${-(nh + (oh - nh) * 0.3)} ${yCerv + 5} ${-(oh + 1.5)} ${mid} ${-oh} ${yOccTop} `;

  // roots: from (nh, yCerv) up to the tip(s) and back down to (-nh, yCerv)
  let root: string;
  if (nRoots === 1) {
    root =
      `C ${nh + 1} ${rootMid} ${nh * 0.5} ${yTip + 5} 0 ${yTip} ` +
      `C ${-nh * 0.5} ${yTip + 5} ${-(nh + 1)} ${rootMid} ${-nh} ${yCerv} `;
  } else {
    const rth = nh * 1.35; // outer-root tip half-width (splayed)
    const yNotch = yCerv * 0.5; // depth of the V between roots
    if (nRoots === 2) {
      root =
        `C ${nh + 1} ${rootMid} ${rth} ${yTip + 8} ${rth} ${yTip + 3} ` +
        `C ${rth} ${yTip + 9} ${rth * 0.4} ${yNotch + 4} 0 ${yNotch} ` +
        `C ${-rth * 0.4} ${yNotch + 4} ${-rth} ${yTip + 9} ${-rth} ${yTip + 3} ` +
        `C ${-rth} ${yTip + 8} ${-(nh + 1)} ${rootMid} ${-nh} ${yCerv} `;
    } else {
      const xNotch = rth * 0.5;
      root =
        `C ${nh + 1} ${rootMid} ${rth} ${yTip + 8} ${rth} ${yTip + 4} ` +
        `C ${rth} ${yTip + 9} ${rth * 0.78} ${yNotch + 3} ${xNotch} ${yNotch} ` +
        `C ${xNotch * 0.6} ${yNotch + 3} ${xNotch * 0.4} ${yTip + 6} 0 ${yTip} ` +
        `C ${-xNotch * 0.4} ${yTip + 6} ${-xNotch * 0.6} ${yNotch + 3} ${-xNotch} ${yNotch} ` +
        `C ${-rth * 0.78} ${yNotch + 3} ${-rth} ${yTip + 9} ${-rth} ${yTip + 4} ` +
        `C ${-rth} ${yTip + 8} ${-(nh + 1)} ${rootMid} ${-nh} ${yCerv} `;
    }
  }

  return `M ${-oh} ${yOccTop} ` + occ + rightCrown + root + leftCrown + `Z`;
}

function cervicalLinePath(kind: ToothKind, cw: number): string {
  const w =
    kind === "molar" ? cw * 0.36 : kind === "premolar" ? cw * 0.3 : kind === "canine" ? cw * 0.24 : cw * 0.3;
  return `M ${-w} ${CERV_Y} L ${w} ${CERV_Y}`;
}

// --- Occlusal (top) view, drawn centred on the origin ---
function occlusalOutlinePath(kind: ToothKind, fdi: number): string {
  if (kind === "molar" || kind === "premolar") {
    const s = kind === "molar" ? 13 : 11; // half-size of the rounded square
    const r = 3.5;
    return (
      `M ${-s + r} ${-s} L ${s - r} ${-s} Q ${s} ${-s} ${s} ${-s + r} L ${s} ${s - r} ` +
      `Q ${s} ${s} ${s - r} ${s} L ${-s + r} ${s} Q ${-s} ${s} ${-s} ${s - r} L ${-s} ${-s + r} ` +
      `Q ${-s} ${-s} ${-s + r} ${-s} Z`
    );
  }
  if (kind === "canine") {
    const w = 9.5;
    const h = 13;
    return `M 0 ${h} C ${-w} ${h * 0.3} ${-w} ${-h * 0.6} 0 ${-h} C ${w} ${-h * 0.6} ${w} ${h * 0.3} 0 ${h} Z`;
  }
  // incisor: a horizontal lozenge
  const w = fdi % 10 === 1 ? 12 : 9.5;
  const h = 7.5;
  return `M ${-w} 0 Q ${-w} ${-h} 0 ${-h} Q ${w} ${-h} ${w} 0 Q ${w} ${h} 0 ${h} Q ${-w} ${h} ${-w} 0 Z`;
}

function occlusalDividerPath(kind: ToothKind): string | null {
  if (kind === "molar" || kind === "premolar") {
    const s = kind === "molar" ? 13 : 11;
    return `M ${-s + 2.5} 0 L ${s - 2.5} 0 M 0 ${-s + 2.5} L 0 ${s - 2.5}`; // a "+" → the boxed look
  }
  return null;
}

// Status → fill / stroke
const STATUS_FILL: Record<ToothStatus, { fill: string; stroke: string; text: string }> = {
  PROBLEM: { fill: "#fecaca", stroke: "#dc2626", text: "#991b1b" },
  UNDER_TREATMENT: { fill: "#fde68a", stroke: "#d97706", text: "#92400e" },
  TREATED: { fill: "#a7f3d0", stroke: "#059669", text: "#065f46" },
  MISSING: { fill: "#e7e5e4", stroke: "#78716c", text: "#57534e" },
};
const NEUTRAL_FILL = { fill: "#ffffff", stroke: "#64748b", text: "#475569" };

interface ToothColumnProps {
  fdi: number;
  jaw: "upper" | "lower";
  col: number;
  record?: ToothRecord;
  onClick: (fdi: number) => void;
  filterFlagged: boolean;
  applyMode?: boolean;
  isApplySource?: boolean;
}

function ToothColumn({
  fdi,
  jaw,
  col,
  record,
  onClick,
  filterFlagged,
  applyMode,
  isApplySource,
}: ToothColumnProps) {
  const kind = toothType(fdi);
  const cw = crownWidth(kind, fdi);
  const status = record?.status;
  const colors = status ? STATUS_FILL[status] : NEUTRAL_FILL;
  const missing = status === "MISSING";
  const fill = status && !missing ? colors.fill : "#ffffff";
  const stroke = colors.stroke;
  const dimmed = filterFlagged && !record;
  const conditions = record ? parseConditions(record.conditions) : [];

  const x = colX(col);
  const isUpper = jaw === "upper";
  const occTop = isUpper ? Y_UO : Y_LO;
  const buccalTop = isUpper ? Y_UB : Y_LB;
  const cellTop = Math.min(buccalTop, occTop);
  const cellBot = Math.max(buccalTop + H_BUCCAL, occTop + H_OCCL);

  // Upper: roots up (no flip). Lower: flip vertically so the crown is at the top and roots point down.
  const buccalTransform = isUpper
    ? `translate(${x} ${Y_UB})`
    : `translate(${x} ${Y_LB + H_BUCCAL}) scale(1 -1)`;
  const occTransform = `translate(${x} ${occTop + H_OCCL / 2})`;

  const toothD = buccalToothPath(kind, cw, isUpper);
  const cervD = cervicalLinePath(kind, cw);
  const occOutlineD = occlusalOutlinePath(kind, fdi);
  const occDivD = occlusalDividerPath(kind);

  const tooltipParts: string[] = [`Tooth ${fdi}`];
  if (status) tooltipParts.push(STATUS_LABEL[status]);
  if (conditions.length) tooltipParts.push(conditions.join(", "));
  if (record?.treatment) tooltipParts.push(`Tx: ${record.treatment}`);
  const tooltip = tooltipParts.join(" · ");

  const applyTargetable = applyMode && !isApplySource;
  const cls = isApplySource
    ? "dental-tooth dental-tooth-source"
    : applyTargetable
    ? "dental-tooth dental-tooth-target"
    : "dental-tooth";

  return (
    <g
      role="button"
      onClick={() => onClick(fdi)}
      style={{ cursor: applyTargetable ? "copy" : "pointer", opacity: dimmed ? 0.28 : 1 }}
      className={cls}
    >
      <title>{applyTargetable ? `${tooltip} — click to copy` : tooltip}</title>
      <rect
        x={x - COL_W / 2 + 1}
        y={cellTop}
        width={COL_W - 2}
        height={cellBot - cellTop}
        fill="transparent"
      />
      <g transform={buccalTransform}>
        <path d={toothD} fill={fill} stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
        <path d={cervD} fill="none" stroke={stroke} strokeWidth={1.3} strokeLinecap="round" />
        {missing && (
          <path
            d={`M ${-cw * 0.36} ${CERV_Y + 4} L ${cw * 0.36} ${OCC_TOP_Y - 2} M ${cw * 0.36} ${CERV_Y + 4} L ${-cw * 0.36} ${OCC_TOP_Y - 2}`}
            stroke={stroke}
            strokeWidth={1.7}
            strokeLinecap="round"
          />
        )}
      </g>
      <g transform={occTransform}>
        <path d={occOutlineD} fill={fill} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
        {occDivD && !missing && <path d={occDivD} fill="none" stroke={stroke} strokeWidth={1.2} />}
      </g>
      <text
        x={x}
        y={isUpper ? Y_NUM_TOP : Y_NUM_BOT}
        textAnchor="middle"
        fontSize={13}
        fontWeight={700}
        fill={status ? colors.text : "#475569"}
        style={{ userSelect: "none" }}
      >
        {fdi}
      </text>
    </g>
  );
}

interface DentalArchSvgProps {
  recordsByFdi: Map<number, ToothRecord>;
  onSelect: (fdi: number) => void;
  filterFlagged: boolean;
  applyMode?: boolean;
  applySourceFdi?: number | null;
}

function DentalArchSvg({
  recordsByFdi,
  onSelect,
  filterFlagged,
  applyMode,
  applySourceFdi,
}: DentalArchSvgProps) {
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="w-full h-auto select-none"
      role="img"
      aria-label="Dental chart"
    >
      <style>{`
        .dental-tooth { transition: filter 120ms ease-out; cursor: pointer; }
        .dental-tooth:hover { filter: drop-shadow(0 1.5px 3px rgba(37,99,235,0.4)); }
        .dental-tooth-target:hover { filter: drop-shadow(0 0 0 2px rgba(13,148,136,0.45)) drop-shadow(0 1.5px 3px rgba(13,148,136,0.4)); }
        .dental-tooth-source { filter: drop-shadow(0 0 0 2.5px rgba(37,99,235,0.55)); }
      `}</style>

      {/* vertical dashed midline + UPPER / LINGUAL / LOWER */}
      <line x1={MID_X} x2={MID_X} y1={Y_UB - 4} y2={Y_LB + H_BUCCAL + 4} stroke="#cbd5e1" strokeDasharray="3 4" strokeWidth={1.3} />
      <text x={MID_X} y={Y_NUM_TOP} textAnchor="middle" fontSize={13} fontWeight={700} fill="#475569" letterSpacing="0.08em">
        UPPER
      </text>
      <line x1={SIDE_PAD - 10} x2={MID_X - 36} y1={Y_MID} y2={Y_MID} stroke="#475569" strokeWidth={1.4} />
      <line x1={MID_X + 36} x2={GRID_W - SIDE_PAD + 10} y1={Y_MID} y2={Y_MID} stroke="#475569" strokeWidth={1.4} />
      <text x={MID_X} y={Y_MID + 4} textAnchor="middle" fontSize={13} fontWeight={700} fill="#475569" letterSpacing="0.08em">
        LINGUAL
      </text>
      <text x={MID_X} y={Y_NUM_BOT} textAnchor="middle" fontSize={13} fontWeight={700} fill="#475569" letterSpacing="0.08em">
        LOWER
      </text>

      {/* RIGHT / LEFT */}
      <text x={12} y={Y_MID + 4} fontSize={13} fontWeight={700} fill="#475569" letterSpacing="0.05em">
        RIGHT
      </text>
      <text x={GRID_W - 12} y={Y_MID + 4} textAnchor="end" fontSize={13} fontWeight={700} fill="#475569" letterSpacing="0.05em">
        LEFT
      </text>

      {/* teeth */}
      {UPPER_BY_COL.map((fdi, c) => (
        <ToothColumn
          key={`u${fdi}`}
          fdi={fdi}
          jaw="upper"
          col={c}
          record={recordsByFdi.get(fdi)}
          onClick={onSelect}
          filterFlagged={filterFlagged}
          applyMode={applyMode}
          isApplySource={applySourceFdi === fdi}
        />
      ))}
      {LOWER_BY_COL.map((fdi, c) => (
        <ToothColumn
          key={`l${fdi}`}
          fdi={fdi}
          jaw="lower"
          col={c}
          record={recordsByFdi.get(fdi)}
          onClick={onSelect}
          filterFlagged={filterFlagged}
          applyMode={applyMode}
          isApplySource={applySourceFdi === fdi}
        />
      ))}

      {/* ---- Deciduous (primary teeth) oval ---- */}
      <text x={DEC_CX} y={14} textAnchor="middle" fontSize={13} fontWeight={700} fill="#475569" letterSpacing="0.08em">
        DECIDUOUS
      </text>
      <ellipse cx={DEC_CX} cy={DEC_CY} rx={DEC_RX} ry={DEC_RY} fill="none" stroke="#94a3b8" strokeWidth={1.4} />
      <line x1={DEC_CX} x2={DEC_CX} y1={DEC_CY - DEC_RY + 4} y2={DEC_CY + DEC_RY - 4} stroke="#cbd5e1" strokeDasharray="3 4" strokeWidth={1.2} />
      <line x1={DEC_CX - DEC_RX - 10} x2={DEC_CX + DEC_RX + 10} y1={DEC_CY} y2={DEC_CY} stroke="#475569" strokeWidth={1.3} />
      <text x={DEC_CX} y={DEC_CY - DEC_RY * 0.52} textAnchor="middle" fontSize={11} fontWeight={700} fill="#475569" letterSpacing="0.06em">UPPER</text>
      <text x={DEC_CX} y={DEC_CY + DEC_RY * 0.52 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#475569" letterSpacing="0.06em">LOWER</text>
      <text x={DEC_CX - DEC_RX - 28} y={DEC_CY + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#475569">R</text>
      <text x={DEC_CX + DEC_RX + 28} y={DEC_CY + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#475569">L</text>
      {DEC_TEETH.map(({ fdi, theta }) => {
        const kind = toothType(fdi);
        const px = DEC_CX + DEC_RX * Math.sin(theta);
        const py = DEC_CY - DEC_RY * Math.cos(theta);
        const rec = recordsByFdi.get(fdi);
        const status = rec?.status;
        const colors = status ? STATUS_FILL[status] : NEUTRAL_FILL;
        const missing = status === "MISSING";
        const fill = status && !missing ? colors.fill : "#ffffff";
        const stroke = colors.stroke;
        const rot = (theta * 180) / Math.PI;
        const occOutlineD = occlusalOutlinePath(kind, fdi);
        const occDivD = occlusalDividerPath(kind);
        const letter = PRIMARY_LETTERS[(fdi % 10) - 1] ?? "";
        const lx = DEC_CX + (DEC_RX + 16) * Math.sin(theta);
        const ly = DEC_CY - (DEC_RY + 16) * Math.cos(theta);
        const applyTargetable = applyMode && applySourceFdi !== fdi;
        const cls = applySourceFdi === fdi ? "dental-tooth dental-tooth-source" : applyTargetable ? "dental-tooth dental-tooth-target" : "dental-tooth";
        return (
          <g
            key={`d${fdi}`}
            role="button"
            onClick={() => onSelect(fdi)}
            className={cls}
            style={{ cursor: applyTargetable ? "copy" : "pointer", opacity: filterFlagged && !rec ? 0.28 : 1 }}
          >
            <title>{`Tooth ${fdi}${status ? " · " + STATUS_LABEL[status] : ""}`}</title>
            <rect x={px - 12} y={py - 12} width={24} height={24} fill="transparent" />
            <g transform={`translate(${px} ${py}) rotate(${rot}) scale(0.68)`}>
              <path d={occOutlineD} fill={fill} stroke={stroke} strokeWidth={2.1} strokeLinejoin="round" />
              {occDivD && !missing && <path d={occDivD} fill="none" stroke={stroke} strokeWidth={1.7} />}
              {missing && <path d="M -7 -7 L 7 7 M 7 -7 L -7 7" stroke={stroke} strokeWidth={2.4} strokeLinecap="round" />}
            </g>
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={700} fontStyle="italic" fill="#94a3b8">
              {letter}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function DentalChartTab({
  patientId,
  onExit,
}: {
  patientId: string;
  onExit?: () => void;
}) {
  const qc = useQueryClient();
  const queryKey = ["patients", patientId, "toothRecords"] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/tooth-records`);
      const json = await res.json();
      return (json?.data ?? []) as ToothRecord[];
    },
    enabled: !!patientId,
  });

  const records = data ?? [];
  const recordsByFdi = useMemo(() => {
    const m = new Map<number, ToothRecord>();
    for (const r of records) m.set(r.fdi, r);
    return m;
  }, [records]);

  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);
  const [filterFlagged, setFilterFlagged] = useState(false);
  const [applyTemplate, setApplyTemplate] = useState<ToothRecord | null>(null);
  const [recordsOpen, setRecordsOpen] = useState(false); // mobile: collapsed by default

  const upsert = useMutation({
    mutationFn: async (input: {
      fdi: number;
      status: ToothStatus;
      conditions: string[];
      treatment: string;
      notes: string;
    }) => {
      const res = await fetch(`/api/patients/${patientId}/tooth-records`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("save failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (fdi: number) => {
      const res = await fetch(
        `/api/patients/${patientId}/tooth-records?fdi=${fdi}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("delete failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // Lock body scroll while fullscreen + Esc to exit
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedFdi != null) return; // edit modal handles its own Esc
        if (applyTemplate) {
          setApplyTemplate(null);
          return;
        }
        onExit?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onExit, selectedFdi, applyTemplate]);

  const handleToothClick = (fdi: number) => {
    if (applyTemplate) {
      if (fdi === applyTemplate.fdi) return;
      upsert.mutate({
        fdi,
        status: applyTemplate.status,
        conditions: parseConditions(applyTemplate.conditions),
        treatment: applyTemplate.treatment ?? "",
        notes: applyTemplate.notes ?? "",
      });
      return;
    }
    setSelectedFdi(fdi);
  };

  const flaggedCount = records.length;
  const counts = records.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<ToothStatus, number>
  );

  return (
    <div
      data-id="PATIENT-DENTAL-CHART-TAB"
      className="fixed inset-0 z-40 bg-white flex flex-col"
    >
      {/* Top bar */}
      <div className="shrink-0 border-b border-stone-200 bg-white">
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
          {onExit && (
            <button
              onClick={onExit}
              className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 cursor-pointer"
              aria-label="Exit dental chart"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}
          <div className="w-px h-5 bg-stone-200 hidden sm:block" />
          <div className="flex items-center gap-2 min-w-0">
            <Smile className="w-5 h-5 text-blue-600 shrink-0" />
            <h2 className="text-base font-semibold text-stone-900 truncate">
              Dental Chart
            </h2>
            <Badge variant="default" className="text-[10px] shrink-0">
              FDI
            </Badge>
            {flaggedCount > 0 && (
              <Badge variant="primary" className="text-[10px] shrink-0">
                {flaggedCount} recorded
              </Badge>
            )}
          </div>

          {/* Legend (desktop) */}
          <div className="hidden lg:flex items-center gap-3 text-[11px] text-stone-500 ml-6">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Problem
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Under
              treatment
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />{" "}
              Treated
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-stone-400" /> Missing
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant={filterFlagged ? "primary" : "outline"}
              iconLeft={<Filter className="w-3.5 h-3.5" />}
              onClick={() => setFilterFlagged((f) => !f)}
            >
              <span className="hidden sm:inline">
                {filterFlagged ? "Showing flagged" : "Show only flagged"}
              </span>
              <span className="sm:hidden">
                {filterFlagged ? "Flagged" : "All"}
              </span>
            </Button>
            {onExit && (
              <button
                onClick={onExit}
                className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 hover:text-stone-800 cursor-pointer"
                aria-label="Close"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Legend (mobile) */}
        <div className="lg:hidden flex items-center gap-3 px-4 sm:px-6 pb-2 text-[11px] text-stone-500 overflow-x-auto">
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Problem
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Under tx
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Treated
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-stone-400" /> Missing
          </span>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Chart area */}
          <div className="flex-1 min-w-0 overflow-auto flex flex-col bg-gradient-to-b from-stone-50 via-white to-stone-50">
            {applyTemplate && (
              <div className="sticky top-0 z-10 shrink-0 bg-blue-50 border-b border-blue-200 px-4 sm:px-6 py-2.5 flex items-center gap-3 flex-wrap">
                <Copy className="w-4 h-4 text-blue-700 shrink-0" />
                <div className="text-xs text-blue-900 min-w-0">
                  <span className="font-semibold">
                    Copying tooth {applyTemplate.fdi}
                  </span>
                  <span className="text-blue-700">
                    {" "}
                    ({STATUS_LABEL[applyTemplate.status]}
                    {parseConditions(applyTemplate.conditions).length > 0 &&
                      ` · ${parseConditions(applyTemplate.conditions).join(
                        ", "
                      )}`}
                    {applyTemplate.treatment && ` · Tx: ${applyTemplate.treatment}`}
                    ) — click teeth to apply
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  iconLeft={<Check className="w-3.5 h-3.5" />}
                  onClick={() => setApplyTemplate(null)}
                  className="ml-auto shrink-0"
                >
                  Done
                </Button>
              </div>
            )}
            <div className="m-auto w-full min-w-[1000px] sm:min-w-0 max-w-[1700px] px-3 sm:px-8 py-4 sm:py-8">
              <p className="lg:hidden sticky left-0 z-[5] text-[11px] text-stone-400 pb-2 whitespace-nowrap">
                Swipe sideways to see all teeth · tap any tooth to record an issue
              </p>
              <DentalArchSvg
                recordsByFdi={recordsByFdi}
                onSelect={handleToothClick}
                filterFlagged={filterFlagged}
                applyMode={!!applyTemplate}
                applySourceFdi={applyTemplate?.fdi ?? null}
              />

              {/* Counts strip */}
              {flaggedCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-6 text-xs justify-center">
                  {(
                    [
                      "PROBLEM",
                      "UNDER_TREATMENT",
                      "TREATED",
                      "MISSING",
                    ] as ToothStatus[]
                  )
                    .filter((s) => counts[s])
                    .map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-stone-200 text-stone-700 shadow-sm"
                      >
                        <span
                          className={cn("w-2 h-2 rounded-full", STATUS_DOT[s])}
                        />
                        {STATUS_LABEL[s]}:{" "}
                        <span className="font-semibold">{counts[s]}</span>
                      </span>
                    ))}
                </div>
              )}

              <p className="text-center text-xs text-stone-400 mt-4">
                Click any tooth to record findings
              </p>
            </div>
          </div>

          {/* Recorded list (sidebar on desktop, collapsible sheet on mobile) */}
          {flaggedCount > 0 && (
            <aside
              className={cn(
                "shrink-0 lg:w-80 border-t lg:border-t-0 lg:border-l border-stone-200 bg-white lg:overflow-y-auto lg:max-h-none",
                recordsOpen ? "max-h-[55vh] overflow-y-auto" : "overflow-hidden"
              )}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => setRecordsOpen((o) => !o)}
                className="px-4 py-3 border-b border-stone-100 sticky top-0 bg-white z-10 flex items-center justify-between gap-2 cursor-pointer lg:cursor-default select-none"
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-stone-900">
                    Recorded teeth ({flaggedCount})
                  </h3>
                  <p className="text-[11px] text-stone-400 hidden lg:block">
                    Click an entry to edit
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-stone-400 shrink-0 lg:hidden transition-transform",
                    recordsOpen && "rotate-180"
                  )}
                />
              </div>
              <div className={cn("p-3 space-y-2", !recordsOpen && "hidden lg:block")}>
                {records.map((r) => {
                  const conds = parseConditions(r.conditions);
                  const isActiveSource = applyTemplate?.id === r.id;
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        "group relative flex items-start gap-3 p-3 rounded-lg transition-colors",
                        isActiveSource
                          ? "bg-blue-50 ring-1 ring-blue-300"
                          : "bg-stone-50 hover:bg-stone-100"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedFdi(r.fdi)}
                        className="absolute inset-0 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-300"
                        aria-label={`Edit tooth ${r.fdi}`}
                      />
                      <div
                        className={cn(
                          "relative w-9 h-9 rounded-md flex items-center justify-center text-xs font-semibold border-2 shrink-0",
                          STATUS_STYLES[r.status]
                        )}
                      >
                        {r.fdi}
                      </div>
                      <div className="relative min-w-0 flex-1 pointer-events-none">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-stone-900">
                            Tooth {r.fdi}
                          </span>
                          <Badge
                            variant={
                              r.status === "TREATED"
                                ? "success"
                                : r.status === "UNDER_TREATMENT"
                                ? "warning"
                                : r.status === "MISSING"
                                ? "default"
                                : "danger"
                            }
                            className="text-[10px]"
                          >
                            {STATUS_LABEL[r.status]}
                          </Badge>
                        </div>
                        {conds.length > 0 && (
                          <div className="text-xs text-stone-500 mt-0.5">
                            {conds.join(", ")}
                          </div>
                        )}
                        {r.treatment && (
                          <div className="text-xs text-blue-600 mt-0.5">
                            Treatment: {r.treatment}
                          </div>
                        )}
                        {r.notes && (
                          <div className="text-xs text-stone-500 mt-0.5 italic">
                            {r.notes}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setApplyTemplate(isActiveSource ? null : r);
                        }}
                        className={cn(
                          "relative shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-300",
                          isActiveSource
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "bg-white text-blue-700 border border-blue-200 hover:bg-blue-50"
                        )}
                        title={
                          isActiveSource
                            ? "Stop copying"
                            : "Copy this record to other teeth"
                        }
                      >
                        {isActiveSource ? (
                          <>
                            <Check className="w-3 h-3" />
                            Active
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </aside>
          )}
        </div>
      )}

      <ToothEditModal
        fdi={selectedFdi}
        existing={selectedFdi != null ? recordsByFdi.get(selectedFdi) : undefined}
        onClose={() => setSelectedFdi(null)}
        onSave={async (input) => {
          await upsert.mutateAsync(input);
          setSelectedFdi(null);
        }}
        onClear={async (fdi) => {
          await remove.mutateAsync(fdi);
          setSelectedFdi(null);
        }}
        saving={upsert.isPending}
        clearing={remove.isPending}
      />
    </div>
  );
}

interface ToothEditModalProps {
  fdi: number | null;
  existing?: ToothRecord;
  onClose: () => void;
  onSave: (input: {
    fdi: number;
    status: ToothStatus;
    conditions: string[];
    treatment: string;
    notes: string;
  }) => Promise<void> | void;
  onClear: (fdi: number) => Promise<void> | void;
  saving: boolean;
  clearing: boolean;
}

function ToothEditModal({
  fdi,
  existing,
  onClose,
  onSave,
  onClear,
  saving,
  clearing,
}: ToothEditModalProps) {
  const isOpen = fdi != null;
  const [status, setStatus] = useState<ToothStatus>("PROBLEM");
  const [conditions, setConditions] = useState<string[]>([]);
  const [treatment, setTreatment] = useState("");
  const [notes, setNotes] = useState("");
  const [customCondition, setCustomCondition] = useState("");

  // re-sync when modal opens or FDI changes
  const syncKey = `${fdi}-${existing?.id ?? "new"}-${isOpen}`;
  const [prevKey, setPrevKey] = useState(syncKey);
  if (syncKey !== prevKey) {
    setPrevKey(syncKey);
    if (isOpen) {
      setStatus(existing?.status ?? "PROBLEM");
      setConditions(parseConditions(existing?.conditions ?? null));
      setTreatment(existing?.treatment ?? "");
      setNotes(existing?.notes ?? "");
      setCustomCondition("");
    }
  }

  if (fdi == null) return null;

  const toggleCondition = (c: string) => {
    setConditions((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  const addCustom = () => {
    const v = customCondition.trim();
    if (!v) return;
    if (!conditions.includes(v)) setConditions([...conditions, v]);
    setCustomCondition("");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Tooth ${fdi}`}
      subtitle="Update status, conditions, treatment, and notes"
      size="lg"
      footer={
        <>
          {existing && (
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => onClear(fdi)}
              loading={clearing}
              disabled={saving}
              className="mr-auto text-red-600 hover:bg-red-50"
            >
              Clear record
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={clearing}
            onClick={() =>
              onSave({ fdi, status, conditions, treatment, notes })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-2">
            Status
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              ["PROBLEM", "UNDER_TREATMENT", "TREATED", "MISSING"] as ToothStatus[]
            ).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all cursor-pointer",
                  status === s
                    ? STATUS_STYLES[s]
                    : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Conditions */}
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-2">
            Conditions
          </label>
          <div className="flex flex-wrap gap-1.5">
            {CONDITIONS.map((c) => {
              const on = conditions.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCondition(c)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer",
                    on
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-stone-200 text-stone-500 hover:bg-stone-50"
                  )}
                >
                  {c}
                </button>
              );
            })}
            {conditions
              .filter((c) => !CONDITIONS.includes(c))
              .map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-50 border border-blue-300 text-blue-700"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() => toggleCondition(c)}
                    className="p-0.5 rounded-full hover:bg-blue-100 cursor-pointer"
                  >
                    <XIcon className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input
              value={customCondition}
              onChange={(e) => setCustomCondition(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder="Add custom condition…"
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={addCustom}>
              Add
            </Button>
          </div>
        </div>

        {/* Treatment */}
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-2">
            Planned / current treatment
          </label>
          <Select
            value={treatment}
            onChange={(e) => setTreatment(e.target.value)}
            options={TREATMENTS.map((t) => ({
              value: t,
              label: t || "— None —",
            }))}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-2">
            Notes
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Clinical notes, observations, history…"
          />
        </div>
      </div>
    </Modal>
  );
}
