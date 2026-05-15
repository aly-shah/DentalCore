/**
 * @route POST /api/booking/request
 * Public — accepts a booking request from the /book wizard.
 *
 * Anti-spam:
 *   - honeypot field (`hp`) — bots tend to fill it; we reject if non-empty
 *   - per-IP token-bucket: at most 5 requests / 10 min from one address
 *   - rejects obviously bogus phone numbers (must be ≥7 digits)
 *
 * The request lands in PENDING and shows up on /admin/booking-requests
 * for a receptionist to confirm. We don't auto-create the Appointment
 * to (a) avoid double-booking under load and (b) let staff verify the
 * patient details.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bypassTenantScope } from "@/lib/tenant-context";
import { computeSlots, timeToMinutes, minutesToTime } from "@/lib/booking/availability";
import { toClinicDay } from "@/lib/utils";
import { logger } from "@/lib/logger";

const schema = z.object({
  treatmentId:    z.string().min(1),
  doctorId:       z.string().optional(),
  branchId:       z.string().optional(),
  preferredDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferredStart: z.string().regex(/^\d{2}:\d{2}$/),
  name:           z.string().min(2).max(120),
  phone:          z.string().min(7).max(30),
  email:          z.string().email().max(200).optional().or(z.literal("")),
  notes:          z.string().max(500).optional(),
  /** Honeypot — must be empty. */
  hp:             z.string().max(200).optional(),
});

// In-memory rate limiter. Per-process is fine for a single PM2 fork;
// upgrade to Redis if the deployment grows beyond one node.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const ipHits = new Map<string, number[]>();

function ipOk(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    ipHits.set(ip, hits);
    return false;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  // Sweep occasionally so the map doesn't grow forever.
  if (ipHits.size > 5000) {
    for (const [k, ts] of ipHits) {
      if (ts.every((t) => now - t > RATE_LIMIT_WINDOW_MS)) ipHits.delete(k);
    }
  }
  return true;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    if (!ipOk(ip)) {
      return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const v = parsed.data;

    // Honeypot — silently 200 so bots don't learn they were blocked.
    if (v.hp && v.hp.trim().length > 0) {
      return NextResponse.json({ success: true, data: { id: "spam-ignored" } });
    }

    const data = await bypassTenantScope(async () => {
      const treatment = await prisma.treatment.findUnique({
        where: { id: v.treatmentId },
        select: { id: true, name: true, duration: true, isActive: true, tenantId: true },
      });
      if (!treatment || !treatment.isActive) return { error: "treatment_not_found" as const };
      const duration = treatment.duration > 0 ? treatment.duration : 30;

      // Resolve doctor — explicit or "any" (we'll record null and let
      // staff assign on confirmation). When explicit, verify the slot
      // is still free so two people can't grab the same time.
      const doctor = v.doctorId
        ? await prisma.user.findFirst({
            where: { id: v.doctorId, role: "DOCTOR", isActive: true },
            select: { id: true, name: true, branchId: true },
          })
        : null;

      const date = new Date(`${v.preferredDate}T00:00:00`);
      const startMin = timeToMinutes(v.preferredStart);
      const endMin = startMin + duration;
      if (endMin > 24 * 60) return { error: "invalid_time" as const };
      const endTime = minutesToTime(endMin);

      // Conflict check (only when a specific doctor was requested).
      // For "any doctor" we let the front-desk pick on confirmation.
      if (doctor) {
        const schedule = await prisma.schedule.findFirst({
          where: { doctorId: doctor.id, dayOfWeek: date.getDay(), isActive: true },
          select: { startTime: true, endTime: true, breakStart: true, breakEnd: true, slotMinutes: true, doctorId: true, dayOfWeek: true },
        });
        const [appts, blocked, leaves] = await Promise.all([
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
        if (leaves) return { error: "slot_unavailable" as const };
        const candidates = computeSlots({
          dateKey: toClinicDay(date),
          dayOfWeek: date.getDay(),
          doctorId: doctor.id,
          schedule,
          busy: [...appts, ...blocked].map((b) => ({ startTime: b.startTime, endTime: b.endTime })),
          durationMinutes: duration,
        });
        const matched = candidates.some((s) => s.time === v.preferredStart);
        if (!matched) return { error: "slot_unavailable" as const };
      }

      // If the phone matches an existing patient, link the request to
      // them so the receptionist sees "existing patient" and doesn't
      // create a duplicate Lead.
      const digits = v.phone.replace(/[^0-9]/g, "");
      const tail = digits.slice(-9);
      let patientId: string | null = null;
      if (tail) {
        const match = await prisma.patient.findFirst({
          where: { deletedAt: null, phone: { contains: tail } },
          select: { id: true, phone: true },
        });
        if (match && (match.phone ?? "").replace(/[^0-9]/g, "") === digits) {
          patientId = match.id;
        }
      }

      const created = await prisma.bookingRequest.create({
        data: {
          tenantId: treatment.tenantId ?? null,
          branchId: v.branchId ?? doctor?.branchId ?? null,
          name: v.name.trim(),
          phone: v.phone.trim(),
          email: v.email?.trim() || null,
          patientId,
          treatmentId: treatment.id,
          treatmentName: treatment.name,
          notes: v.notes?.trim() || null,
          doctorId: doctor?.id ?? null,
          preferredDate: date,
          preferredStart: v.preferredStart,
          preferredEnd: endTime,
          status: "PENDING",
          source: "web",
        },
        select: { id: true, status: true },
      });

      // Notify receptionists. We don't know who's on duty, so we
      // notify every active RECEPTIONIST + ADMIN in the same branch
      // (or all when branchId is null). Dedup'd per request id.
      const staff = await prisma.user.findMany({
        where: {
          isActive: true,
          role: { in: ["RECEPTIONIST", "ADMIN", "SUPER_ADMIN"] },
          ...(doctor?.branchId ? { branchId: doctor.branchId } : {}),
        },
        select: { id: true },
      });
      const dedupKey = `booking-req:${created.id}`;
      await Promise.all(
        staff.map((u) =>
          prisma.notification.upsert({
            where: { userId_dedupKey: { userId: u.id, dedupKey } },
            create: {
              userId: u.id,
              dedupKey,
              title: `New online booking from ${v.name.trim()}`,
              message: `${v.preferredDate} ${v.preferredStart} · ${treatment.name}`,
              type: "APPOINTMENT",
              link: `/admin/booking-requests`,
              tenantId: treatment.tenantId ?? null,
            },
            update: {},
          })
        )
      );

      return { id: created.id, status: created.status };
    });

    if ("error" in data) {
      const status =
        data.error === "treatment_not_found" ? 404 :
        data.error === "slot_unavailable"    ? 409 :
                                                400;
      return NextResponse.json({ success: false, error: data.error }, { status });
    }
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    logger.api("POST", "/api/booking/request", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
