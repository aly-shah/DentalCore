"use client";

import type { Dispatch, SetStateAction, ChangeEvent } from "react";
import {
  MAX_PATIENT_AGE,
  MIN_PATIENT_AGE,
  calculateAge,
} from "@/lib/utils";

export interface AgeFormShape {
  dateOfBirth: string;
  age: string;
}

/**
 * Two-way binding for the paired "Date of Birth" / "Age" inputs.
 *
 * The two are mutually exclusive: a patient either has an exact birthday on
 * file or an approximate age. Editing one clears the other so the form always
 * submits a single source of truth, and the age box mirrors the computed age
 * whenever a DOB is present.
 */
export function usePatientAgeField<T extends AgeFormShape>(
  form: T,
  setForm: Dispatch<SetStateAction<T>>
) {
  const ageValue = form.dateOfBirth
    ? String(calculateAge(form.dateOfBirth))
    : form.age;

  const onDobChange = (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, dateOfBirth: e.target.value, age: "" }));

  const onAgeChange = (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({
      ...f,
      age: e.target.value.replace(/[^0-9]/g, "").slice(0, 3),
      dateOfBirth: "",
    }));

  return { ageValue, onDobChange, onAgeChange };
}

/** Shared client-side rule: exactly one of DOB / age, and a sane age. */
export function validatePatientAge(form: AgeFormShape): string | null {
  if (!form.dateOfBirth && !form.age) {
    return "Enter a date of birth or an age";
  }
  if (!form.dateOfBirth) {
    const age = Number(form.age);
    if (!Number.isInteger(age) || age < MIN_PATIENT_AGE || age > MAX_PATIENT_AGE) {
      return `Age must be a whole number between ${MIN_PATIENT_AGE} and ${MAX_PATIENT_AGE}`;
    }
  }
  return null;
}

/** The DOB/age half of a create or update payload. */
export function patientAgePayload(form: AgeFormShape) {
  return form.dateOfBirth
    ? { dateOfBirth: form.dateOfBirth, age: undefined }
    : { dateOfBirth: undefined, age: Number(form.age) };
}
