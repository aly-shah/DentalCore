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
