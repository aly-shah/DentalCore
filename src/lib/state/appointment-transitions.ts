/**
 * Appointment status state machine.
 *
 * Single source of truth for which status transitions are allowed. Used
 * by /api/appointments/[id] (validation on PUT), the doctor app, the
 * reception check-in flow, and the test suite.
 *
 * State diagram is documented in the enterprise bible §9.2.
 */

export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "WAITING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | "RESCHEDULED";

export const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "SCHEDULED",
  "CONFIRMED",
  "CHECKED_IN",
  "WAITING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "RESCHEDULED",
];

/**
 * Adjacency map: from → set of valid next states.
 * Empty array means terminal state.
 */
const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  SCHEDULED: ["CONFIRMED", "CHECKED_IN", "CANCELLED", "NO_SHOW", "RESCHEDULED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW", "RESCHEDULED"],
  CHECKED_IN: ["WAITING", "IN_PROGRESS", "COMPLETED", "NO_SHOW"],
  WAITING: ["IN_PROGRESS", "COMPLETED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  RESCHEDULED: ["SCHEDULED"],
};

export function isAppointmentStatus(value: string): value is AppointmentStatus {
  return (APPOINTMENT_STATUSES as readonly string[]).includes(value);
}

export function allowedNextStatuses(from: AppointmentStatus): AppointmentStatus[] {
  return [...(VALID_TRANSITIONS[from] ?? [])];
}

export function isValidTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  if (from === to) return true; // no-op write is always allowed
  return allowedNextStatuses(from).includes(to);
}

export function isTerminalStatus(status: AppointmentStatus): boolean {
  return allowedNextStatuses(status).length === 0;
}
