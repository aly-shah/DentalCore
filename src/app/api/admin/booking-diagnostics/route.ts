/**
 * @route GET /api/admin/booking-diagnostics?treatmentId=...&date=YYYY-MM-DD
 *
 * Triage helper for "no slots on /book". For a single treatment + date,
 * lists every active DOCTOR and explains exactly why each one does or
 * doesn't appear in the public booking grid.
 *
 * Returns one of these reasons per doctor:
 *   ok                    — slots are available (count + sample times)
 *   no_schedule_for_day   — no Schedule row for this weekday
 *   on_approved_leave     — DoctorLeave covers this date
 *   fully_blocked         — Schedule + appts + blocks fill the day
 *   doctor_not_rostered   — Schedule row exists but isActive=false
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { computeSlots } from "@/lib/booking/availability";
import { toClinicDay } from "@/lib/utils";
import { logger } from "@/lib/logger";

const schema = z.object({
  treatmentId: z.string().min(1).optional(),
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST", "DOCTOR"] });
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const parsed = schema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "validation_failed" }, { status: 400 });
    }
    const treatmentId = parsed.data.treatmentId;
    const date = parsed.data.date
      ? new Date(`${parsed.data.date}T00:00:00`)
      : new Date(new Date().setHours(0, 0, 0, 0));
    const dateKey = toClinicDay(date);
    const dayOfWeek = date.getDay();

    // ── Global preconditions ──────────────────────────────────────────
    const [activeTreatments, allDoctors, anySchedules, branches] = await Promise.all([
      prisma.treatment.findMany({
        where: { isActive: true },
        select: { id: true, name: true, duration: true },
      }),
      prisma.user.findMany({
        where: { role: "DOCTOR", isActive: true },
        select: { id: true, name: true, branchId: true, isActive: true },
      }),
      prisma.schedule.findMany({
        where: { isActive: true },
        select: { id: true, doctorId: true, dayOfWeek: true, isActive: true },
      }),
      prisma.branch.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      }),
    ]);

    const treatment = treatmentId
      ? activeTreatments.find((t) => t.id === treatmentId) ?? null
      : (activeTreatments[0] ?? null);
    const duration = treatment?.duration && treatment.duration > 0 ? treatment.duration : 30;

    // ── Per-doctor explanation ────────────────────────────────────────
    const perDoctor = [] as Array<{
      doctorId: string;
      doctorName: string;
      branchId: string | null;
      reason:
        | "ok" | "no_schedule_for_day" | "on_approved_leave"
        | "fully_blocked" | "no_active_branch";
      detail?: string;
      sampleSlots?: string[];
    }>;

    for (const doc of allDoctors) {
      const onLeave = await prisma.doctorLeave.findFirst({
        where: {
          doctorId: doc.id, status: "APPROVED",
          startDate: { lte: date }, endDate: { gte: date },
        },
        select: { id: true, reason: true },
      });
      if (onLeave) {
        perDoctor.push({
          doctorId: doc.id, doctorName: doc.name, branchId: doc.branchId,
          reason: "on_approved_leave",
          detail: onLeave.reason ?? "Approved leave",
        });
        continue;
      }

      const schedule = await prisma.schedule.findFirst({
        where: { doctorId: doc.id, dayOfWeek, isActive: true },
        select: {
          dayOfWeek: true, startTime: true, endTime: true,
          breakStart: true, breakEnd: true, slotMinutes: true, doctorId: true,
        },
      });
      if (!schedule) {
        const anyForDoctor = anySchedules.some((s) => s.doctorId === doc.id);
        perDoctor.push({
          doctorId: doc.id, doctorName: doc.name, branchId: doc.branchId,
          reason: "no_schedule_for_day",
          detail: anyForDoctor
            ? `Doctor has schedule rows but none for dayOfWeek=${dayOfWeek}`
            : "Doctor has NO Schedule rows at all — configure on /admin/schedules",
        });
        continue;
      }

      const [appts, blocks] = await Promise.all([
        prisma.appointment.findMany({
          where: { doctorId: doc.id, date, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
          select: { startTime: true, endTime: true },
        }),
        prisma.blockedSlot.findMany({
          where: {
            date,
            OR: [{ doctorId: doc.id }, ...(doc.branchId ? [{ branchId: doc.branchId }] : [])],
          },
          select: { startTime: true, endTime: true, reason: true },
        }),
      ]);

      const slots = computeSlots({
        dateKey,
        dayOfWeek,
        doctorId: doc.id,
        schedule,
        busy: [...appts, ...blocks].map((b) => ({ startTime: b.startTime, endTime: b.endTime })),
        durationMinutes: duration,
      });

      if (slots.length === 0) {
        perDoctor.push({
          doctorId: doc.id, doctorName: doc.name, branchId: doc.branchId,
          reason: "fully_blocked",
          detail:
            `Schedule ${schedule.startTime}–${schedule.endTime} ` +
            `· ${appts.length} appt(s) · ${blocks.length} block(s) · ` +
            `treatment needs ${duration} min`,
        });
      } else {
        perDoctor.push({
          doctorId: doc.id, doctorName: doc.name, branchId: doc.branchId,
          reason: "ok",
          detail: `${slots.length} slots`,
          sampleSlots: slots.slice(0, 4).map((s) => s.time),
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        date: dateKey,
        dayOfWeek,
        treatment: treatment
          ? { id: treatment.id, name: treatment.name, duration: treatment.duration }
          : null,
        treatments: {
          totalActive: activeTreatments.length,
          withZeroDuration: activeTreatments.filter((t) => !t.duration || t.duration <= 0).length,
        },
        doctors: {
          totalActive: allDoctors.length,
          withAnySchedule: new Set(anySchedules.map((s) => s.doctorId)).size,
        },
        branches: branches.length,
        perDoctor,
        summary: {
          ok:                   perDoctor.filter((p) => p.reason === "ok").length,
          no_schedule_for_day:  perDoctor.filter((p) => p.reason === "no_schedule_for_day").length,
          on_approved_leave:    perDoctor.filter((p) => p.reason === "on_approved_leave").length,
          fully_blocked:        perDoctor.filter((p) => p.reason === "fully_blocked").length,
        },
      },
    });
  } catch (err) {
    logger.api("GET", "/api/admin/booking-diagnostics", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
