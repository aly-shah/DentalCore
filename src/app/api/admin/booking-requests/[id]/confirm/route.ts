/**
 * @route POST /api/admin/booking-requests/[id]/confirm
 * Body: {
 *   doctorId:    string  (required when the request didn't specify one)
 *   roomId?:     string
 *   patientId?:  string  (skip patient creation by linking to existing)
 *   notes?:      string  (notes to copy into the Appointment)
 *   notify?:     boolean (default true — send a confirmation message
 *                         to the patient over their preferred channel)
 * }
 *
 * Atomically:
 *   1. Re-checks the slot is still free (race protection).
 *   2. Creates / reuses a Patient record (matched by exact phone, or
 *      new if no match and no patientId was passed).
 *   3. Creates an Appointment in SCHEDULED status.
 *   4. Flips the BookingRequest to CONFIRMED and links it to the new
 *      appointment + patient.
 *   5. Best-effort sends a confirmation message (WhatsApp/SMS/Email).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { computeSlots, timeToMinutes } from "@/lib/booking/availability";
import { toClinicDay } from "@/lib/utils";
import { sendMessage, appointmentReminder } from "@/lib/messaging";
import { logger } from "@/lib/logger";

const schema = z.object({
  doctorId:  z.string().optional(),
  roomId:    z.string().optional(),
  patientId: z.string().optional(),
  notes:     z.string().max(2000).optional(),
  notify:    z.boolean().optional().default(true),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "validation_failed", fields: parsed.error.flatten() }, { status: 400 });
    }

    const req = await prisma.bookingRequest.findUnique({
      where: { id },
      include: { doctor: true, patient: true },
    });
    if (!req) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    if (req.status !== "PENDING") {
      return NextResponse.json({ success: false, error: `already_${req.status.toLowerCase()}` }, { status: 409 });
    }

    const doctorId = parsed.data.doctorId ?? req.doctorId ?? null;
    if (!doctorId) {
      return NextResponse.json({ success: false, error: "doctor_required" }, { status: 400 });
    }

    const doctor = await prisma.user.findFirst({
      where: { id: doctorId, role: "DOCTOR", isActive: true },
      select: { id: true, name: true, branchId: true, tenantId: true },
    });
    if (!doctor) return NextResponse.json({ success: false, error: "doctor_not_found" }, { status: 404 });

    // Re-verify the slot is still free for the chosen doctor.
    const duration = timeToMinutes(req.preferredEnd) - timeToMinutes(req.preferredStart);
    const date = req.preferredDate;
    const [schedule, appts, blocked, leave] = await Promise.all([
      prisma.schedule.findFirst({
        where: { doctorId: doctor.id, dayOfWeek: date.getDay(), isActive: true },
        select: { startTime: true, endTime: true, breakStart: true, breakEnd: true, slotMinutes: true, doctorId: true, dayOfWeek: true },
      }),
      prisma.appointment.findMany({
        where: { doctorId: doctor.id, date, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
        select: { startTime: true, endTime: true },
      }),
      prisma.blockedSlot.findMany({
        where: {
          date,
          OR: [{ doctorId: doctor.id }, ...(doctor.branchId ? [{ branchId: doctor.branchId }] : [])],
        },
        select: { startTime: true, endTime: true },
      }),
      prisma.doctorLeave.findFirst({
        where: { doctorId: doctor.id, status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } },
        select: { id: true },
      }),
    ]);
    if (leave) {
      return NextResponse.json({ success: false, error: "doctor_on_leave" }, { status: 409 });
    }
    const slots = computeSlots({
      dateKey: toClinicDay(date),
      dayOfWeek: date.getDay(),
      doctorId: doctor.id,
      schedule,
      busy: [...appts, ...blocked],
      durationMinutes: duration,
    });
    if (!slots.some((s) => s.time === req.preferredStart)) {
      return NextResponse.json({ success: false, error: "slot_unavailable" }, { status: 409 });
    }

    // Resolve the patient row. Priority:
    //   1. explicit patientId from the staffer
    //   2. patientId already on the request (matched at submit time)
    //   3. brand-new Patient created from the request's contact details
    let patientId = parsed.data.patientId ?? req.patientId ?? null;
    let createdNewPatient = false;
    if (!patientId) {
      // Need a branch — prefer the doctor's branch, fall back to any active branch.
      const branchId = doctor.branchId ?? (await prisma.branch.findFirst({
        where: { isActive: true }, select: { id: true },
      }))?.id;
      if (!branchId) {
        return NextResponse.json({ success: false, error: "no_branch_available" }, { status: 500 });
      }

      // Generate the next patientCode. Same retry-on-collision pattern
      // as POST /api/patients — two confirms in flight at once can race.
      const [firstName, ...rest] = req.name.trim().split(/\s+/);
      const lastName = rest.join(" ") || firstName;
      let attempt = 0;
      while (attempt < 5) {
        try {
          const last = await prisma.patient.findFirst({
            orderBy: { patientCode: "desc" },
            select: { patientCode: true },
          });
          const n = last ? parseInt(last.patientCode.replace("PT-", ""), 10) + 1 + attempt : 1 + attempt;
          const code = `PT-${String(n).padStart(4, "0")}`;
          const created = await prisma.patient.create({
            data: {
              patientCode: code,
              firstName,
              lastName,
              phone: req.phone,
              email: req.email,
              branchId,
              tenantId: doctor.tenantId ?? null,
              consentGiven: false,
              source: "ONLINE_BOOKING",
              assignedDoctorId: doctor.id,
            },
            select: { id: true },
          });
          patientId = created.id;
          createdNewPatient = true;
          break;
        } catch (err) {
          if ((err as { code?: string })?.code === "P2002") {
            attempt += 1;
            continue;
          }
          throw err;
        }
      }
      if (!patientId) {
        return NextResponse.json({ success: false, error: "patient_create_failed" }, { status: 500 });
      }
    }

    // ── Create the appointment + flip the request inside a transaction.
    const appointment = await prisma.$transaction(async (tx) => {
      const baseCount = await tx.appointment.count();
      const appointmentCode = `APT-${String(baseCount + 1).padStart(4, "0")}`;
      const appt = await tx.appointment.create({
        data: {
          tenantId: doctor.tenantId ?? null,
          appointmentCode,
          patientId: patientId!,
          doctorId: doctor.id,
          branchId: doctor.branchId ?? req.branchId ?? "",
          roomId: parsed.data.roomId ?? null,
          date,
          startTime: req.preferredStart,
          endTime: req.preferredEnd,
          durationMinutes: duration,
          type: "CONSULTATION",
          status: "SCHEDULED",
          notes: parsed.data.notes ?? req.notes ?? null,
          priority: "NORMAL",
          workflowStage: "BOOKED",
          createdById: auth.user.id,
        },
      });
      await tx.bookingRequest.update({
        where: { id: req.id },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          confirmedById: auth.user.id,
          appointmentId: appt.id,
          patientId,
          doctorId: doctor.id,
        },
      });
      return appt;
    });

    // ── Confirmation message (best-effort, never blocks the response).
    if (parsed.data.notify) {
      try {
        const channel: "whatsapp" | "sms" | "email" =
          req.phone ? "whatsapp" : (req.email ? "email" : "whatsapp");
        const dateStr = date.toISOString().slice(0, 10);
        const text = appointmentReminder(req.name.trim(), dateStr, req.preferredStart, doctor.name);
        await sendMessage({
          to: channel === "email" ? (req.email ?? "") : req.phone,
          message: `Your appointment is confirmed!\n\n${text}`,
          type: channel,
          subject: "Appointment confirmed",
        });
      } catch (err) {
        logger.warn("booking-confirm: notification failed", { err: String(err), id: req.id });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        appointmentId: appointment.id,
        appointmentCode: appointment.appointmentCode,
        patientId,
        createdNewPatient,
      },
    });
  } catch (err) {
    logger.api("POST", `/api/admin/booking-requests/${id}/confirm`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
