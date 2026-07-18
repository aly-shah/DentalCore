import { describe, it, expect, vi, afterEach } from "vitest";
import { parsePatientAge, serializePatientAge } from "./patient-age";
import { resolvePatientAge, formatAge, isAgeApproximate } from "./utils";
import { impliedBirthYearHint } from "@/hooks/use-patient-age-field";

afterEach(() => vi.useRealTimers());

describe("parsePatientAge", () => {
  it("rejects a body with neither dateOfBirth nor age", () => {
    const r = parsePatientAge({});
    expect(r.ok).toBe(false);
  });

  it("treats empty strings as absent", () => {
    expect(parsePatientAge({ dateOfBirth: "", age: "" }).ok).toBe(false);
  });

  it("stores an exact DOB and leaves age null", () => {
    const r = parsePatientAge({ dateOfBirth: "1994-03-02" });
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.data.dateOfBirth?.toISOString().slice(0, 10)).toBe("1994-03-02");
    expect(r.data.age).toBeNull();
    expect(r.data.ageRecordedAt).toBeNull();
  });

  it("stores an age with a recorded-at stamp and no DOB", () => {
    const r = parsePatientAge({ age: 32 });
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.data.age).toBe(32);
    expect(r.data.dateOfBirth).toBeNull();
    expect(r.data.ageRecordedAt).toBeInstanceOf(Date);
  });

  it("accepts a numeric string age from a form input", () => {
    const r = parsePatientAge({ age: "32" });
    expect(r).toMatchObject({ ok: true, data: { age: 32 } });
  });

  it("prefers an exact DOB when both are sent", () => {
    const r = parsePatientAge({ dateOfBirth: "1994-03-02", age: 99 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.age).toBeNull();
    expect(r.data.dateOfBirth).not.toBeNull();
  });

  it("rejects garbage dates rather than passing Invalid Date to the DB", () => {
    expect(parsePatientAge({ dateOfBirth: "not-a-date" }).ok).toBe(false);
  });

  it("rejects a future date of birth", () => {
    expect(parsePatientAge({ dateOfBirth: "3000-01-01" }).ok).toBe(false);
  });

  it.each([-1, 131, 1.5, "abc"])("rejects out-of-range age %p", (age) => {
    expect(parsePatientAge({ age }).ok).toBe(false);
  });

  it("accepts the boundaries", () => {
    expect(parsePatientAge({ age: 0 }).ok).toBe(true);
    expect(parsePatientAge({ age: 130 }).ok).toBe(true);
  });
});

describe("resolvePatientAge", () => {
  it("returns null when nothing is known", () => {
    expect(resolvePatientAge({ dateOfBirth: null, age: null })).toBeNull();
  });

  it("computes from an exact DOB", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-17"));
    expect(resolvePatientAge({ dateOfBirth: "1994-03-02" })).toBe(32);
  });

  it("does not count a birthday that has not happened yet this year", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-17"));
    expect(resolvePatientAge({ dateOfBirth: "1994-12-31" })).toBe(31);
  });

  it("ages a stored age forward from when it was recorded", () => {
    vi.useFakeTimers().setSystemTime(new Date("2029-07-17"));
    expect(
      resolvePatientAge({ age: 32, ageRecordedAt: "2026-07-17", dateOfBirth: null })
    ).toBe(35);
  });

  it("does not drift within the same year it was recorded", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-12-31"));
    expect(
      resolvePatientAge({ age: 32, ageRecordedAt: "2026-07-17", dateOfBirth: null })
    ).toBe(32);
  });
});

describe("serializePatientAge", () => {
  it("marks a DOB-backed patient as exact", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-17"));
    const out = serializePatientAge({ dateOfBirth: new Date("1994-03-02"), age: null, ageRecordedAt: null });
    expect(out.age).toBe(32);
    expect(out.ageIsApproximate).toBe(false);
  });

  it("marks an age-only patient as approximate", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-17"));
    const out = serializePatientAge({ dateOfBirth: null, age: 32, ageRecordedAt: new Date("2026-07-17") });
    expect(out.age).toBe(32);
    expect(out.ageIsApproximate).toBe(true);
  });
});

describe("formatAge", () => {
  it("renders an em dash when unknown", () => {
    expect(formatAge({ age: null })).toBe("—");
  });

  it("renders an exact age plainly", () => {
    expect(formatAge({ age: 32, ageIsApproximate: false })).toBe("32y");
  });

  it("tildes an approximate age", () => {
    expect(formatAge({ age: 32, ageIsApproximate: true })).toBe("~32y");
  });

  it("renders a newborn rather than treating 0 as unknown", () => {
    expect(formatAge({ age: 0 })).toBe("0y");
  });
});

describe("impliedBirthYearHint", () => {
  it("returns null when a DOB is present", () => {
    expect(impliedBirthYearHint({ dateOfBirth: "1994-03-02", age: "" })).toBeNull();
  });

  it("returns null when no age is entered", () => {
    expect(impliedBirthYearHint({ dateOfBirth: "", age: "" })).toBeNull();
  });

  it("returns null for an out-of-range age", () => {
    expect(impliedBirthYearHint({ dateOfBirth: "", age: "999" })).toBeNull();
  });

  it("spans the two possible birth years for the entered age", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-18"));
    expect(impliedBirthYearHint({ dateOfBirth: "", age: "32" })).toBe("born 1993–1994");
  });

  it("handles a newborn", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-18"));
    expect(impliedBirthYearHint({ dateOfBirth: "", age: "0" })).toBe("born 2025–2026");
  });
});

describe("isAgeApproximate", () => {
  it("is false when a DOB is on file", () => {
    expect(isAgeApproximate({ dateOfBirth: "1994-03-02", age: null })).toBe(false);
  });

  it("is false when nothing is known", () => {
    expect(isAgeApproximate({ dateOfBirth: null, age: null })).toBe(false);
  });
});
