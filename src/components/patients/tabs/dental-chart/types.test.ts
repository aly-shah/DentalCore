import { describe, expect, it } from "vitest";
import {
  effectiveStatus,
  toothCategory,
  parseChips,
  joinChips,
  type ToothRecord,
} from "./types";

const baseTooth = (overrides: Partial<ToothRecord>): ToothRecord => ({
  id: "t-1",
  patientId: "p-1",
  chartId: "c-1",
  fdi: 16,
  status: "HEALTHY",
  conditions: null,
  treatment: null,
  plannedTreatment: null,
  completedTreatment: null,
  surfaces: null,
  priority: "MEDIUM",
  notes: null,
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("effectiveStatus", () => {
  it("returns HEALTHY when tooth is undefined", () => {
    expect(effectiveStatus(undefined)).toBe("HEALTHY");
  });

  it("returns HEALTHY for an empty healthy tooth", () => {
    expect(effectiveStatus(baseTooth({}))).toBe("HEALTHY");
  });

  it("preserves an explicit non-HEALTHY status", () => {
    expect(effectiveStatus(baseTooth({ status: "FILLING" }))).toBe("FILLING");
    expect(effectiveStatus(baseTooth({ status: "MISSING" }))).toBe("MISSING");
  });

  it("derives TREATED from completedTreatment text", () => {
    expect(effectiveStatus(baseTooth({ completedTreatment: "Composite filling 2025-04" }))).toBe("TREATED");
  });

  it("derives TREATED from a surface-level completedTreatment", () => {
    expect(effectiveStatus(baseTooth({
      surfaces: { mesial: { completedTreatment: "Crown placed" } },
    }))).toBe("TREATED");
  });

  it("matches CARIES keywords in conditions", () => {
    expect(effectiveStatus(baseTooth({ conditions: "Mild cavity on mesial" }))).toBe("CARIES");
    expect(effectiveStatus(baseTooth({ conditions: "Suspected caries" }))).toBe("CARIES");
    expect(effectiveStatus(baseTooth({ conditions: "Decay noted" }))).toBe("CARIES");
  });

  it("matches FRACTURE keywords", () => {
    expect(effectiveStatus(baseTooth({ conditions: "Hairline fracture" }))).toBe("FRACTURE");
    expect(effectiveStatus(baseTooth({ conditions: "Cracked cusp" }))).toBe("FRACTURE");
    expect(effectiveStatus(baseTooth({ conditions: "Small chip on incisal" }))).toBe("FRACTURE");
  });

  it("matches MOBILITY", () => {
    expect(effectiveStatus(baseTooth({ conditions: "Grade II mobility" }))).toBe("MOBILITY");
  });

  it("matches PROBLEM for abscess / infection / sensitivity / wear", () => {
    expect(effectiveStatus(baseTooth({ conditions: "Periapical abscess" }))).toBe("PROBLEM");
    expect(effectiveStatus(baseTooth({ conditions: "Sensitivity to cold" }))).toBe("PROBLEM");
    expect(effectiveStatus(baseTooth({ conditions: "Erosion on lingual" }))).toBe("PROBLEM");
  });

  it("falls back to UNDER_TREATMENT when plannedTreatment is set but no condition", () => {
    expect(effectiveStatus(baseTooth({ plannedTreatment: "Crown prep" }))).toBe("UNDER_TREATMENT");
  });

  it("falls back to UNDER_TREATMENT from a surface plannedTreatment", () => {
    expect(effectiveStatus(baseTooth({
      surfaces: { occlusal: { plannedTreatment: "Sealant" } },
    }))).toBe("UNDER_TREATMENT");
  });

  it("falls back to PROBLEM when a surface has any other condition text", () => {
    expect(effectiveStatus(baseTooth({
      surfaces: { mesial: { condition: "Stain" } },
    }))).toBe("PROBLEM");
  });

  it("prefers TREATED over CARIES when both are present (most recent state wins)", () => {
    expect(effectiveStatus(baseTooth({
      conditions: "Was cavity",
      completedTreatment: "Composite filling",
    }))).toBe("TREATED");
  });

  it("treats explicit HEALTHY as deferable — derives from data", () => {
    expect(effectiveStatus(baseTooth({
      status: "HEALTHY",
      conditions: "caries detected",
    }))).toBe("CARIES");
  });
});

describe("toothCategory", () => {
  it("classifies permanent incisors (11-12, 21-22, 31-32, 41-42)", () => {
    for (const fdi of [11, 12, 21, 22, 31, 32, 41, 42]) {
      expect(toothCategory(fdi)).toBe("incisor");
    }
  });

  it("classifies permanent canines (13, 23, 33, 43)", () => {
    for (const fdi of [13, 23, 33, 43]) {
      expect(toothCategory(fdi)).toBe("canine");
    }
  });

  it("classifies permanent premolars (14-15, 24-25, 34-35, 44-45)", () => {
    for (const fdi of [14, 15, 24, 25, 34, 35, 44, 45]) {
      expect(toothCategory(fdi)).toBe("premolar");
    }
  });

  it("classifies permanent molars (16-18, 26-28, 36-38, 46-48)", () => {
    for (const fdi of [16, 17, 18, 26, 27, 28, 36, 37, 38, 46, 47, 48]) {
      expect(toothCategory(fdi)).toBe("molar");
    }
  });

  it("classifies primary teeth correctly (no premolars in primary dentition)", () => {
    // Primary incisors
    expect(toothCategory(51)).toBe("incisor");
    expect(toothCategory(62)).toBe("incisor");
    expect(toothCategory(71)).toBe("incisor");
    // Primary canines
    expect(toothCategory(53)).toBe("canine");
    expect(toothCategory(63)).toBe("canine");
    expect(toothCategory(73)).toBe("canine");
    expect(toothCategory(83)).toBe("canine");
    // Primary molars (no premolars — 4/5 are molars in primary)
    expect(toothCategory(54)).toBe("molar");
    expect(toothCategory(65)).toBe("molar");
    expect(toothCategory(74)).toBe("molar");
    expect(toothCategory(85)).toBe("molar");
  });
});

describe("parseChips / joinChips", () => {
  it("parseChips splits on commas + trims + dedupes", () => {
    expect(parseChips("Caries, Sensitivity, Plaque")).toEqual(["Caries", "Sensitivity", "Plaque"]);
    expect(parseChips("  Caries  ,Sensitivity")).toEqual(["Caries", "Sensitivity"]);
  });

  it("parseChips handles null / undefined / empty", () => {
    expect(parseChips(null)).toEqual([]);
    expect(parseChips(undefined)).toEqual([]);
    expect(parseChips("")).toEqual([]);
    expect(parseChips(",  ,")).toEqual([]);
  });

  it("parseChips removes duplicates", () => {
    expect(parseChips("Caries, Caries, Sensitivity")).toEqual(["Caries", "Sensitivity"]);
  });

  it("joinChips produces a comma-separated string", () => {
    expect(joinChips(["a", "b", "c"])).toBe("a, b, c");
  });

  it("joinChips skips empty entries", () => {
    expect(joinChips(["a", "", "b"])).toBe("a, b");
  });

  it("roundtrips through parse → join", () => {
    const original = "Caries, Sensitivity, Plaque";
    expect(joinChips(parseChips(original))).toBe(original);
  });
});
