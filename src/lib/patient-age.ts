import {
  MAX_PATIENT_AGE,
  MIN_PATIENT_AGE,
  isAgeApproximate,
  resolvePatientAge,
} from "@/lib/utils";

/** The three columns that together describe how old a patient is. */
export interface PatientAgeFields {
  dateOfBirth: Date | null;
  age: number | null;
  ageRecordedAt: Date | null;
}

export type ParseResult =
  | { ok: true; data: PatientAgeFields }
  | { ok: false; error: string };

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

/**
 * Parse `dateOfBirth` / `age` from a request body into the stored columns.
 *
 * Exactly one of the two must be supplied: an exact DOB wins and leaves `age`
 * null, otherwise the age is stamped with `ageRecordedAt` so it can be aged
 * forward on read. The pair is always written together so a patient can never
 * end up carrying a stale age alongside a newly-set DOB.
 */
export function parsePatientAge(body: {
  dateOfBirth?: unknown;
  age?: unknown;
}): ParseResult {
  const hasDob = !isBlank(body.dateOfBirth);
  const hasAge = !isBlank(body.age);

  if (!hasDob && !hasAge) {
    return { ok: false, error: "Either dateOfBirth or age is required" };
  }

  if (hasDob) {
    const dob = new Date(body.dateOfBirth as string | number | Date);
    if (Number.isNaN(dob.getTime())) {
      return { ok: false, error: "dateOfBirth is not a valid date" };
    }
    if (dob.getTime() > Date.now()) {
      return { ok: false, error: "dateOfBirth cannot be in the future" };
    }
    return { ok: true, data: { dateOfBirth: dob, age: null, ageRecordedAt: null } };
  }

  const age = Number(body.age);
  if (!Number.isInteger(age) || age < MIN_PATIENT_AGE || age > MAX_PATIENT_AGE) {
    return {
      ok: false,
      error: `age must be a whole number between ${MIN_PATIENT_AGE} and ${MAX_PATIENT_AGE}`,
    };
  }
  return { ok: true, data: { dateOfBirth: null, age, ageRecordedAt: new Date() } };
}

/**
 * Shape a patient row for the API: `age` goes out as the age *today*, whether
 * it came from an exact DOB or an approximate age aged forward from when it was
 * recorded. Clients read `age` and never have to know which column backed it;
 * `ageIsApproximate` tells them whether to render "32" or "~32".
 */
export function serializePatientAge<
  T extends { dateOfBirth?: Date | string | null; age?: number | null; ageRecordedAt?: Date | string | null }
>(patient: T) {
  return {
    ...patient,
    age: resolvePatientAge(patient),
    ageIsApproximate: isAgeApproximate(patient),
  };
}

/** True when a PUT body is trying to change how the patient's age is recorded. */
export function touchesAgeFields(body: { dateOfBirth?: unknown; age?: unknown }): boolean {
  return body.dateOfBirth !== undefined || body.age !== undefined;
}
