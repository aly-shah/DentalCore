/**
 * Shared types + pure helpers for the dental chart subsystem.
 * Kept separate from the React component file so they can be unit-tested
 * without pulling in the rendering tree.
 */

export type ToothStatus =
  | "HEALTHY" | "CARIES" | "FILLING" | "CROWN" | "BRIDGE" | "IMPLANT"
  | "MISSING" | "ROOT_CANAL" | "EXTRACTION_NEEDED" | "MOBILITY" | "FRACTURE"
  | "PROBLEM" | "UNDER_TREATMENT" | "TREATED";

export type Surface = "mesial" | "distal" | "occlusal" | "buccal" | "lingual";

export interface SurfaceData {
  condition?: string;
  treatment?: string;
  plannedTreatment?: string;
  completedTreatment?: string;
  notes?: string;
}

export interface ToothRecord {
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

export type ToothCategory = "incisor" | "canine" | "premolar" | "molar";

/**
 * Derive the visual "effective" status from all data on the tooth.
 * Falls back to the explicit status when set, otherwise infers from
 * completed/planned treatment and free-text condition strings (legacy
 * data + surface-level data).
 *
 * Order of resolution:
 *   1. Non-HEALTHY explicit status wins
 *   2. Any completed treatment → TREATED
 *   3. Keyword match in conditions text → CARIES / FRACTURE / MOBILITY / PROBLEM
 *   4. Planned treatment present → UNDER_TREATMENT
 *   5. Any surface-level condition → PROBLEM
 *   6. Default HEALTHY
 */
export function effectiveStatus(tooth: ToothRecord | undefined): ToothStatus {
  if (!tooth) return "HEALTHY";
  if (tooth.status && tooth.status !== "HEALTHY") return tooth.status as ToothStatus;

  if (tooth.completedTreatment?.trim()) return "TREATED";
  for (const d of Object.values(tooth.surfaces ?? {})) {
    if (d?.completedTreatment?.trim()) return "TREATED";
  }

  const collectedText = [
    tooth.conditions ?? "",
    ...Object.values(tooth.surfaces ?? {}).map((d) => d?.condition ?? ""),
  ].join(" ").toLowerCase();
  if (collectedText.match(/cavit|caries|decay/))              return "CARIES";
  if (collectedText.match(/fract|crack|chip/))                return "FRACTURE";
  if (collectedText.match(/mobil/))                           return "MOBILITY";
  if (collectedText.match(/abscess|infect|peri[a-z]*lesion/)) return "PROBLEM";
  if (collectedText.match(/erosion|attrit|abrasion/))         return "PROBLEM";
  if (collectedText.match(/sensi/))                           return "PROBLEM";

  if (tooth.plannedTreatment?.trim()) return "UNDER_TREATMENT";
  for (const d of Object.values(tooth.surfaces ?? {})) {
    if (d?.plannedTreatment?.trim()) return "UNDER_TREATMENT";
  }

  for (const d of Object.values(tooth.surfaces ?? {})) {
    if (d?.condition?.trim()) return "PROBLEM";
  }

  return "HEALTHY";
}

/**
 * Categorize an FDI tooth number. Determines crown shape + occlusal
 * pattern in the SVG renderer.
 *
 *   11-13 / 21-23 / 31-33 / 41-43  — incisors (1-2) + canines (3)
 *   14-15 / 24-25 / 34-35 / 44-45  — premolars
 *   16-18 / 26-28 / 36-38 / 46-48  — molars
 *
 *   Primary 51-85: incisors (1-2), canine (3), molars (4-5).
 */
export function toothCategory(fdi: number): ToothCategory {
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
  return "molar";
}

/** Comma-separated → trimmed, deduped chips. */
export function parseChips(s: string | null | undefined): string[] {
  if (!s) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of s.split(",")) {
    const t = raw.trim();
    if (t && !seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out;
}

/** Chips → comma-separated string. */
export function joinChips(chips: string[]): string {
  return chips.filter((c) => c.trim()).join(", ");
}

/**
 * Tailwind classes per tooth status — used for chips, dots, badge tints
 * in both the chart and the tooth panel.
 */
export const STATUS_STYLES: Record<ToothStatus, { label: string; bg: string; border: string; text: string; dot: string }> = {
  HEALTHY:           { label: "Healthy",       bg: "bg-white",      border: "border-stone-200",   text: "text-stone-700",   dot: "bg-stone-300" },
  CARIES:            { label: "Caries",        bg: "bg-rose-50",    border: "border-rose-300",    text: "text-rose-700",    dot: "bg-rose-500" },
  FILLING:           { label: "Filling",       bg: "bg-amber-50",   border: "border-amber-300",   text: "text-amber-700",   dot: "bg-amber-500" },
  CROWN:             { label: "Crown",         bg: "bg-yellow-50",  border: "border-yellow-400",  text: "text-yellow-800",  dot: "bg-yellow-500" },
  BRIDGE:            { label: "Bridge",        bg: "bg-orange-50",  border: "border-orange-300",  text: "text-orange-700",  dot: "bg-orange-500" },
  IMPLANT:           { label: "Implant",       bg: "bg-blue-50",    border: "border-blue-300",    text: "text-blue-700",    dot: "bg-blue-500" },
  MISSING:           { label: "Missing",       bg: "bg-stone-200",  border: "border-stone-400",   text: "text-stone-500",   dot: "bg-stone-500" },
  ROOT_CANAL:        { label: "Root Canal",    bg: "bg-purple-50",  border: "border-purple-300",  text: "text-purple-700",  dot: "bg-purple-500" },
  EXTRACTION_NEEDED: { label: "Extract",       bg: "bg-red-100",    border: "border-red-400",     text: "text-red-700",     dot: "bg-red-600" },
  MOBILITY:          { label: "Mobile",        bg: "bg-pink-50",    border: "border-pink-300",    text: "text-pink-700",    dot: "bg-pink-500" },
  FRACTURE:          { label: "Fracture",      bg: "bg-violet-50",  border: "border-violet-300",  text: "text-violet-700",  dot: "bg-violet-500" },
  PROBLEM:           { label: "Problem",       bg: "bg-rose-50",    border: "border-rose-300",    text: "text-rose-700",    dot: "bg-rose-400" },
  UNDER_TREATMENT:   { label: "In Treatment",  bg: "bg-cyan-50",    border: "border-cyan-300",    text: "text-cyan-700",    dot: "bg-cyan-500" },
  TREATED:           { label: "Treated",       bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-700", dot: "bg-emerald-500" },
};

/** Ordered status list (sans PROBLEM — used in pickers). */
export const STATUSES: ToothStatus[] = [
  "HEALTHY", "CARIES", "FILLING", "CROWN", "BRIDGE", "IMPLANT",
  "ROOT_CANAL", "EXTRACTION_NEEDED", "MOBILITY", "FRACTURE",
  "MISSING", "UNDER_TREATMENT", "TREATED",
];

export const SURFACE_LABELS: Record<Surface, string> = {
  mesial: "M (Mesial)",
  distal: "D (Distal)",
  occlusal: "O (Occlusal)",
  buccal: "B (Buccal)",
  lingual: "L (Lingual)",
};

/**
 * Surface fill colour based on the tooth's surface data or top-level
 * status. If the surface has its own condition/treatment, paint that
 * surface; otherwise fall back to the tooth's overall status colour.
 */
export function surfaceFill(
  toothStatus: ToothStatus,
  surfaceData: SurfaceData | undefined,
): { fill: string; stroke: string } {
  if (surfaceData?.condition || surfaceData?.completedTreatment) {
    if (surfaceData.completedTreatment) {
      return { fill: "#10b981", stroke: "#059669" };
    }
    return { fill: "#f43f5e", stroke: "#e11d48" };
  }
  if (surfaceData?.plannedTreatment) {
    return { fill: "#06b6d4", stroke: "#0891b2" };
  }
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

/** Surface picker chip list (used in the tooth panel's Surfaces tab). */
export const SURFACE_CHIPS: Array<{ key: Surface; label: string; short: string }> = [
  { key: "occlusal", label: "Occlusal", short: "O" },
  { key: "mesial",   label: "Mesial",   short: "M" },
  { key: "distal",   label: "Distal",   short: "D" },
  { key: "buccal",   label: "Buccal",   short: "B" },
  { key: "lingual",  label: "Lingual",  short: "L" },
];

/** Common conditions — chip presets for fast charting. */
export const CONDITION_CHIPS = [
  "Cavity", "Sensitivity", "Plaque", "Tartar", "Erosion", "Attrition",
  "Abrasion", "Discoloration", "Chipped", "Cracked", "Mobility",
  "Gingivitis", "Periodontitis", "Recession", "Abscess",
];

/**
 * Quick-action conditions — most common per-surface findings.
 * Each maps to a one-tap state-fill: clicking the pill adds the
 * condition (or treatment) and dismisses the suggestion bar.
 */
export const QUICK_CONDITIONS: Array<{
  label: string;
  field: "condition" | "plannedTreatment" | "completedTreatment";
  value: string;
  emoji: string;
  tone: "rose" | "amber" | "emerald" | "cyan" | "stone";
}> = [
  { label: "Cavity",    field: "condition",          value: "Cavity",            emoji: "🔍", tone: "rose" },
  { label: "Sensitive", field: "condition",          value: "Sensitivity",       emoji: "⚡", tone: "rose" },
  { label: "Plaque",    field: "condition",          value: "Plaque",            emoji: "🧫", tone: "amber" },
  { label: "Cracked",   field: "condition",          value: "Cracked",           emoji: "⚠️", tone: "rose" },
  { label: "Filling",   field: "plannedTreatment",   value: "Filling",           emoji: "🩹", tone: "cyan" },
  { label: "RCT",       field: "plannedTreatment",   value: "Root Canal",        emoji: "🦷", tone: "cyan" },
  { label: "Crown",     field: "plannedTreatment",   value: "Crown",             emoji: "👑", tone: "cyan" },
  { label: "Filled ✓",  field: "completedTreatment", value: "Composite Filling", emoji: "✓",  tone: "emerald" },
  { label: "Cleaned ✓", field: "completedTreatment", value: "Cleaning",          emoji: "✨", tone: "emerald" },
];

/** Common dental procedures — chip presets for planned/completed treatment. */
export const TREATMENT_CHIPS = [
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
export function suggestTreatments(status: ToothStatus, cat: ToothCategory, hasSurfaceData: boolean): string[] {
  const anterior = cat === "incisor" || cat === "canine";

  switch (status) {
    case "CARIES":
      return ["Composite Filling", "Filling", anterior ? "Composite Filling" : "RCT + Crown", "Crown (PFM)"];
    case "FRACTURE":
      return anterior
        ? ["Bonding", "Veneer", "Crown (E-Max)", "Root Canal"]
        : ["Crown (PFM)", "Crown (Zirconia)", "Root Canal", "Extraction"];
    case "ROOT_CANAL":
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
