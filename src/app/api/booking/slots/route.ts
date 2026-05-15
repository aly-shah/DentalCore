/**
 * @route GET /api/booking/slots
 * Public — used by the booking wizard to show "next 14 days" of
 * available start times for the chosen treatment + (optional) doctor.
 *
 * Query params:
 *   treatmentId  required — drives duration
 *   doctorId     optional — "any doctor" when omitted
 *   branchId     optional — restricts to one branch
 *   days         optional — search window (default 14, max 60)
 *   from         optional — YYYY-MM-DD start date (defaults to today)
 *
 * Response: { success, data: [{ date, slots: [{ time, endTime, doctorId, doctorName }] }] }
 *   — grouped per date for easy UI rendering. Days with zero slots are
 *   included so the wizard can show "no availability" gracefully.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bypassTenantScope } from "@/lib/tenant-context";
import { toClinicDay } from "@/lib/utils";
import { computeSlots } from "@/lib/booking/availability";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  treatmentId: z.string().min(1),
  doctorId:    z.string().optional(),
  branchId:    z.string().optional(),
  days:        z.coerce.number().int().min(1).max(60).optional(),
  from:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

interface DaySlots {
  date: string;
  slots: { time: string; endTime: string; doctorId: string; doctorName: string }[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "validation_failed", fields: parsed.error.flatten() }, { status: 400 });
    }
    const { treatmentId, doctorId, branchId } = parsed.data;
    const windowDays = parsed.data.days ?? 14;
    const fromDate = parsed.data.from
      ? new Date(`${parsed.data.from}T00:00:00`)
      : new Date(new Date().setHours(0, 0, 0, 0));

    const data = await bypassTenantScope(async () => {
      const treatment = await prisma.treatment.findUnique({
        where: { id: treatmentId },
        select: { id: true, duration: true, isActive: true },
      });
      if (!treatment || !treatment.isActive) return { error: "treatment_not_found" as const };
      const duration = treatment.duration > 0 ? treatment.duration : 30;

      // Doctor pool — only active DOCTORs, optionally filtered.
      const doctors = await prisma.user.findMany({
        where: {
          role: "DOCTOR",
          isActive: true,
          ...(doctorId ? { id: doctorId } : {}),
          ...(branchId ? { branchId } : {}),
        },
        select: { id: true, name: true, branchId: true },
      });
      if (doctors.length === 0) return { error: "no_doctors" as const };
      const doctorIds = doctors.map((d) => d.id);

      // Bulk-fetch the inputs we need across the window: schedules,
      // leaves, appointments, and blocked slots. Keep query counts O(1)
      // in the window length so the public endpoint stays cheap.
      const windowEnd = new Date(fromDate);
      windowEnd.setDate(windowEnd.getDate() + windowDays);

      const [schedules, leaves, appointments, blocked] = await Promise.all([
        prisma.schedule.findMany({
          where: { doctorId: { in: doctorIds }, isActive: true },
          select: {
            doctorId: true, dayOfWeek: true, startTime: true, endTime: true,
            breakStart: true, breakEnd: true, slotMinutes: true,
          },
        }),
        prisma.doctorLeave.findMany({
          where: {
            doctorId: { in: doctorIds }, status: "APPROVED",
            startDate: { lt: windowEnd },
            endDate:   { gte: fromDate },
          },
          select: { doctorId: true, startDate: true, endDate: true },
        }),
        prisma.appointment.findMany({
          where: {
            doctorId: { in: doctorIds },
            date: { gte: fromDate, lt: windowEnd },
            status: { notIn: ["CANCELLED", "NO_SHOW"] },
          },
          select: { doctorId: true, date: true, startTime: true, endTime: true },
        }),
        prisma.blockedSlot.findMany({
          where: {
            OR: [
              { doctorId: { in: doctorIds } },
              ...(branchId ? [{ branchId }] : []),
            ],
            date: { gte: fromDate, lt: windowEnd },
          },
          select: { doctorId: true, branchId: true, date: true, startTime: true, endTime: true },
        }),
      ]);

      const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
      const todayKey = toClinicDay(new Date());

      const out: DaySlots[] = [];
      for (let i = 0; i < windowDays; i++) {
        const date = new Date(fromDate);
        date.setDate(fromDate.getDate() + i);
        const dateKey = toClinicDay(date);
        const dayOfWeek = date.getDay();

        const daySlots: DaySlots["slots"] = [];

        for (const doc of doctors) {
          // Skip if doctor is on approved leave that overlaps this day
          const onLeave = leaves.some(
            (l) => l.doctorId === doc.id && l.startDate <= date && l.endDate >= date
          );
          if (onLeave) continue;

          const schedule = schedules.find((s) => s.doctorId === doc.id && s.dayOfWeek === dayOfWeek);
          if (!schedule) continue; // doctor not rostered on this weekday

          // Build busy set for this doctor on this date — appointments
          // belonging to the doctor + blocked slots scoped to the
          // doctor OR the doctor's branch.
          const dayAppts = appointments.filter(
            (a) => a.doctorId === doc.id && toClinicDay(a.date) === dateKey
          );
          const dayBlocks = blocked.filter(
            (b) =>
              toClinicDay(b.date) === dateKey &&
              (b.doctorId === doc.id || (b.branchId && b.branchId === doc.branchId))
          );
          const busy = [
            ...dayAppts.map((a) => ({ startTime: a.startTime, endTime: a.endTime })),
            ...dayBlocks.map((b) => ({ startTime: b.startTime, endTime: b.endTime })),
          ];

          const slots = computeSlots({
            dateKey,
            dayOfWeek,
            doctorId: doc.id,
            schedule,
            busy,
            durationMinutes: duration,
            earliestMinutes: dateKey === todayKey ? nowMins + 30 : 0,
          });

          for (const s of slots) {
            daySlots.push({ ...s, doctorName: doc.name });
          }
        }

        // Sort each day's slots by time, then doctor name.
        daySlots.sort((a, b) =>
          a.time.localeCompare(b.time) || a.doctorName.localeCompare(b.doctorName)
        );
        out.push({ date: dateKey, slots: daySlots });
      }
      return { days: out, durationMinutes: duration };
    });

    if ("error" in data) {
      return NextResponse.json({ success: false, error: data.error }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (err) {
    logger.api("GET", "/api/booking/slots", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
