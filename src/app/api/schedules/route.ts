/**
 * @route GET /api/schedules
 * @route PUT /api/schedules
 *
 * Weekly recurring availability per doctor. The schedule rows feed:
 *   - the staff calendar /api/calendar
 *   - the staff availability finder /api/calendar/availability
 *   - the public booking wizard /api/booking/slots
 *
 * GET ?doctorId=...  returns every active Schedule row for the doctor
 *                    (or every active row, when doctorId is omitted).
 *
 * PUT body = { doctorId: string, days: ScheduleDay[] }
 *   Atomically replaces the doctor's entire week. Use this as the
 *   single write path so the UI doesn't have to diff old vs. new.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayShape = z.object({
  dayOfWeek:   z.number().int().min(0).max(6),
  startTime:   z.string().regex(TIME),
  endTime:     z.string().regex(TIME),
  breakStart:  z.string().regex(TIME).nullable().optional(),
  breakEnd:    z.string().regex(TIME).nullable().optional(),
  slotMinutes: z.number().int().min(5).max(240).optional().default(30),
});

const putSchema = z.object({
  doctorId: z.string().min(1),
  days:     z.array(dayShape),
});

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const doctorId = searchParams.get("doctorId");

    const rows = await prisma.schedule.findMany({
      where: { isActive: true, ...(doctorId ? { doctorId } : {}) },
      orderBy: [{ doctorId: "asc" }, { dayOfWeek: "asc" }],
      select: {
        id: true, doctorId: true, dayOfWeek: true,
        startTime: true, endTime: true,
        breakStart: true, breakEnd: true, slotMinutes: true,
        doctor: { select: { id: true, name: true, branchId: true } },
      },
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    logger.api("GET", "/api/schedules", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { doctorId, days } = parsed.data;

    // Sanity-check times: end > start, and if a break is set, both
    // endpoints exist and fall inside the working window.
    for (const d of days) {
      if (d.startTime >= d.endTime) {
        return NextResponse.json({ success: false, error: `bad_window:${d.dayOfWeek}` }, { status: 400 });
      }
      const bs = d.breakStart ?? null;
      const be = d.breakEnd ?? null;
      if ((bs && !be) || (!bs && be)) {
        return NextResponse.json({ success: false, error: `partial_break:${d.dayOfWeek}` }, { status: 400 });
      }
      if (bs && be && (bs < d.startTime || be > d.endTime || bs >= be)) {
        return NextResponse.json({ success: false, error: `bad_break:${d.dayOfWeek}` }, { status: 400 });
      }
    }

    // Confirm the doctor actually exists + is a doctor.
    const doctor = await prisma.user.findFirst({
      where: { id: doctorId, role: "DOCTOR", isActive: true },
      select: { id: true },
    });
    if (!doctor) {
      return NextResponse.json({ success: false, error: "doctor_not_found" }, { status: 404 });
    }

    // Replace the whole week in a transaction so callers see either
    // the old set or the new set, never a partial blend.
    await prisma.$transaction([
      prisma.schedule.deleteMany({ where: { doctorId } }),
      ...(days.length === 0
        ? []
        : [prisma.schedule.createMany({
            data: days.map((d) => ({
              doctorId,
              dayOfWeek:   d.dayOfWeek,
              startTime:   d.startTime,
              endTime:     d.endTime,
              breakStart:  d.breakStart ?? null,
              breakEnd:    d.breakEnd ?? null,
              slotMinutes: d.slotMinutes ?? 30,
              isActive:    true,
            })),
          })]),
    ]);

    return NextResponse.json({ success: true, data: { doctorId, count: days.length } });
  } catch (err) {
    logger.api("PUT", "/api/schedules", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
