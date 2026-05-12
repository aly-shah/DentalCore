import { describe, expect, it } from "vitest";
import {
  allowedNextStatuses,
  APPOINTMENT_STATUSES,
  isAppointmentStatus,
  isTerminalStatus,
  isValidTransition,
} from "./appointment-transitions";

describe("appointment state machine", () => {
  describe("isAppointmentStatus", () => {
    it("accepts every known status", () => {
      for (const s of APPOINTMENT_STATUSES) {
        expect(isAppointmentStatus(s)).toBe(true);
      }
    });
    it("rejects unknown values", () => {
      expect(isAppointmentStatus("BOGUS")).toBe(false);
      expect(isAppointmentStatus("")).toBe(false);
      expect(isAppointmentStatus("scheduled")).toBe(false); // case sensitive
    });
  });

  describe("happy-path full lifecycle", () => {
    it("walks SCHEDULED → CONFIRMED → CHECKED_IN → WAITING → IN_PROGRESS → COMPLETED", () => {
      expect(isValidTransition("SCHEDULED", "CONFIRMED")).toBe(true);
      expect(isValidTransition("CONFIRMED", "CHECKED_IN")).toBe(true);
      expect(isValidTransition("CHECKED_IN", "WAITING")).toBe(true);
      expect(isValidTransition("WAITING", "IN_PROGRESS")).toBe(true);
      expect(isValidTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
    });

    it("walk-in flow can skip CONFIRMED", () => {
      expect(isValidTransition("SCHEDULED", "CHECKED_IN")).toBe(true);
    });

    it("CHECKED_IN can skip WAITING and go straight to IN_PROGRESS", () => {
      expect(isValidTransition("CHECKED_IN", "IN_PROGRESS")).toBe(true);
    });
  });

  describe("cancellation paths", () => {
    it.each(["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] as const)(
      "%s can be CANCELLED",
      (from) => {
        expect(isValidTransition(from, "CANCELLED")).toBe(true);
      }
    );

    it("CHECKED_IN cannot be CANCELLED (must complete or no-show)", () => {
      expect(isValidTransition("CHECKED_IN", "CANCELLED")).toBe(false);
    });
  });

  describe("no-show paths", () => {
    it.each(["SCHEDULED", "CONFIRMED", "CHECKED_IN", "WAITING"] as const)(
      "%s can become NO_SHOW",
      (from) => {
        expect(isValidTransition(from, "NO_SHOW")).toBe(true);
      }
    );

    it("IN_PROGRESS cannot become NO_SHOW (patient is in the chair)", () => {
      expect(isValidTransition("IN_PROGRESS", "NO_SHOW")).toBe(false);
    });
  });

  describe("reschedule flow", () => {
    it("SCHEDULED can be RESCHEDULED", () => {
      expect(isValidTransition("SCHEDULED", "RESCHEDULED")).toBe(true);
    });
    it("RESCHEDULED rolls back to SCHEDULED for the new slot", () => {
      expect(isValidTransition("RESCHEDULED", "SCHEDULED")).toBe(true);
    });
    it("COMPLETED appointments cannot be rescheduled", () => {
      expect(isValidTransition("COMPLETED", "RESCHEDULED")).toBe(false);
    });
  });

  describe("terminal states", () => {
    it("COMPLETED is terminal", () => {
      expect(isTerminalStatus("COMPLETED")).toBe(true);
      expect(allowedNextStatuses("COMPLETED")).toEqual([]);
    });
    it("CANCELLED is terminal", () => {
      expect(isTerminalStatus("CANCELLED")).toBe(true);
    });
    it("NO_SHOW is terminal", () => {
      expect(isTerminalStatus("NO_SHOW")).toBe(true);
    });
  });

  describe("forbidden backward transitions", () => {
    it("cannot go IN_PROGRESS → SCHEDULED", () => {
      expect(isValidTransition("IN_PROGRESS", "SCHEDULED")).toBe(false);
    });
    it("cannot un-cancel", () => {
      expect(isValidTransition("CANCELLED", "SCHEDULED")).toBe(false);
      expect(isValidTransition("CANCELLED", "CONFIRMED")).toBe(false);
    });
    it("cannot un-complete", () => {
      expect(isValidTransition("COMPLETED", "IN_PROGRESS")).toBe(false);
      expect(isValidTransition("COMPLETED", "CHECKED_IN")).toBe(false);
    });
  });

  describe("self-transition", () => {
    it.each(APPOINTMENT_STATUSES)("%s → %s is a no-op (allowed)", (s) => {
      expect(isValidTransition(s, s)).toBe(true);
    });
  });
});
