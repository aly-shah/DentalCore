/**
 * @system DentaCore ERP - Appointments List & Creation API
 * @route GET /api/appointments - List appointments with filters
 * @route POST /api/appointments - Create appointment
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { clinicDayRange } from "@/lib/utils";
import { requireAuth } from "@/lib/require-auth";
import { createAppointmentSchema, validate } from "@/lib/validations";

import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const doctorId = searchParams.get("doctorId");
    const status = searchParams.get("status");
    const branchId = searchParams.get("branchId");
    const patientId = searchParams.get("patientId");
    const type = searchParams.get("type");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (date) {
      const { gte, lt } = clinicDayRange(date);
      where.date = { gte, lt };
    }
    if (doctorId) where.doctorId = doctorId;
    if (status) where.status = status;
    if (branchId) where.branchId = branchId;
    if (patientId) where.patientId = patientId;
    if (type) where.type = type;

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true, profileImage: true } },
        doctor: { select: { id: true, name: true, speciality: true, avatar: true } },
        branch: { select: { id: true, name: true, code: true } },
        room: { select: { id: true, name: true, number: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json({ success: true, data: appointments });
  } catch (error) {
    logger.api("GET", "/api/appointments", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch appointments" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST", "ASSISTANT"] });
    if (auth.response) return auth.response;

    const body = await request.json();
    const v = validate(createAppointmentSchema, body);
    if (!v.success) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }

    const d = v.data;

    /**
     * Build the list of dates this request should create.
     * - No recurrence: just the requested date.
     * - WEEKLY:        every 1 week
     * - BIWEEKLY:      every 2 weeks
     * - MONTHLY:       every 4 weeks (rough — calendar-month math is left
     *                  to the UI / a future refinement)
     * - EVERY_N_WEEKS: caller-specified intervalWeeks
     */
    function buildDates(): Date[] {
      const first = new Date(d.date);
      if (!d.recurrence) return [first];
      const stepWeeks =
        d.recurrence.pattern === "WEEKLY"   ? 1 :
        d.recurrence.pattern === "BIWEEKLY" ? 2 :
        d.recurrence.pattern === "MONTHLY"  ? 4 :
        Math.max(1, d.recurrence.intervalWeeks ?? 1);
      const out: Date[] = [];
      for (let i = 0; i < d.recurrence.count; i++) {
        const dt = new Date(first);
        dt.setDate(first.getDate() + i * stepWeeks * 7);
        out.push(dt);
      }
      return out;
    }
    const dates = buildDates();

    const created = await prisma.$transaction(async (tx) => {
      const baseCount = await tx.appointment.count();
      const appts = [] as Awaited<ReturnType<typeof tx.appointment.create>>[];

      for (let i = 0; i < dates.length; i++) {
        const appointmentCode = `APT-${String(baseCount + i + 1).padStart(4, "0")}`;
        const appt = await tx.appointment.create({
          data: {
            appointmentCode,
            patientId: d.patientId,
            doctorId: d.doctorId,
            branchId: d.branchId,
            roomId: d.roomId || null,
            date: dates[i],
            startTime: d.startTime,
            endTime: d.endTime,
            durationMinutes: d.durationMinutes || 30,
            type: d.type || "CONSULTATION",
            status: "SCHEDULED",
            notes: d.notes || null,
            priority: d.priority || "NORMAL",
            workflowStage: "BOOKED",
            createdById: auth.user.id,
          },
          include: {
            patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
            doctor: { select: { id: true, name: true, speciality: true } },
          },
        });
        appts.push(appt);
      }

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: "CREATE",
          module: "APPOINTMENT",
          entityType: appts.length > 1 ? "AppointmentSeries" : "Appointment",
          entityId: appts[0].id,
          details: JSON.stringify({
            appointmentCode: appts[0].appointmentCode,
            ...(appts.length > 1
              ? { seriesSize: appts.length, recurrence: d.recurrence }
              : {}),
          }),
        },
      });

      return appts;
    });

    // Back-compat: for a single appointment, return `data` as the row
    // (existing callers expect this). For a series, return the array.
    return NextResponse.json(
      { success: true, data: created.length === 1 ? created[0] : created },
      { status: 201 }
    );
  } catch (error) {
    logger.api("POST", "/api/appointments", error);
    return NextResponse.json(
      { success: false, error: "Failed to create appointment" },
      { status: 500 }
    );
  }
}
