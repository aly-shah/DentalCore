/**
 * Slot availability — shared between the staff-facing calendar
 * (/api/calendar/availability) and the public booking flow
 * (/api/booking/slots).
 *
 * Given a date and (optionally) a doctor, returns the set of free
 * starting times that satisfy:
 *   - doctor is rostered on that weekday (Schedule)
 *   - doctor is not on approved leave (DoctorLeave)
 *   - time isn't covered by a BlockedSlot
 *   - time doesn't overlap an existing non-cancelled Appointment
 *   - duration fits within the day's working window, after lunch break
 *
 * Functions here are PURE relative to the inputs you pass in — call
 * sites are responsible for the prisma queries that hydrate `schedules`,
 * `appointments`, etc. That makes it easy to use the same logic for
 * the multi-doctor day view and the single-doctor day view without
 * re-querying.
 */

export interface ScheduleWindow {
  doctorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  slotMinutes: number;
}

export interface BusyBlock {
  startTime: string;
  endTime: string;
}

export interface Slot {
  /** ISO date YYYY-MM-DD */
  date: string;
  /** Start time HH:MM */
  time: string;
  /** End time HH:MM, time + durationMinutes */
  endTime: string;
  doctorId: string;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export interface ComputeSlotsArgs {
  /** YYYY-MM-DD — only used to label slots */
  dateKey: string;
  dayOfWeek: number;
  doctorId: string;
  schedule: ScheduleWindow | null;
  /** Existing appointments + BlockedSlot rows, all flattened to {start,end}. */
  busy: BusyBlock[];
  /** Required slot length in minutes (treatment.duration). */
  durationMinutes: number;
  /** Step between slot starts. Defaults to the schedule's slotMinutes
   *  or 30 when no schedule is provided. */
  stepMinutes?: number;
  /** Don't return slots starting before this time-of-day. Pass the
   *  current clock when calling for `today` to hide past slots. */
  earliestMinutes?: number;
  /** Optional cap — when the caller only needs the first N. */
  limit?: number;
  /** Fallback when the doctor has no Schedule entry: assumes the clinic
   *  is open 08:00–18:00 with no break. */
  fallbackWindow?: { startTime: string; endTime: string };
}

/** Compute free slots for a single doctor on a single day. */
export function computeSlots(args: ComputeSlotsArgs): Slot[] {
  const fallback = args.fallbackWindow ?? { startTime: "08:00", endTime: "18:00" };
  const docStart   = timeToMinutes(args.schedule?.startTime ?? fallback.startTime);
  const docEnd     = timeToMinutes(args.schedule?.endTime   ?? fallback.endTime);
  const breakStart = args.schedule?.breakStart ? timeToMinutes(args.schedule.breakStart) : null;
  const breakEnd   = args.schedule?.breakEnd   ? timeToMinutes(args.schedule.breakEnd)   : null;
  const step       = args.stepMinutes ?? args.schedule?.slotMinutes ?? 30;
  const duration   = args.durationMinutes;
  const earliest   = args.earliestMinutes ?? 0;

  const slots: Slot[] = [];
  for (let t = Math.max(docStart, earliest); t + duration <= docEnd; t += step) {
    if (args.limit !== undefined && slots.length >= args.limit) break;

    // Lunch break
    if (breakStart !== null && breakEnd !== null && t < breakEnd && t + duration > breakStart) continue;

    // Existing busy windows (appointments + blocked slots)
    const slotEnd = t + duration;
    const hasConflict = args.busy.some((b) => {
      const bs = timeToMinutes(b.startTime);
      const be = timeToMinutes(b.endTime);
      return t < be && slotEnd > bs;
    });
    if (hasConflict) continue;

    slots.push({
      date: args.dateKey,
      time: minutesToTime(t),
      endTime: minutesToTime(slotEnd),
      doctorId: args.doctorId,
    });
  }
  return slots;
}
