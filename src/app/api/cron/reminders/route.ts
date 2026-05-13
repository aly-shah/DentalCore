/**
 * @system DentaCore ERP — Reminder Generation
 * @route POST /api/cron/reminders — Generate notifications for upcoming events
 * Call this periodically (e.g., every hour via cron job or external trigger)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { toClinicDay } from "@/lib/utils";
import { logger } from "@/lib/logger";

/**
 * Guard the cron endpoint with a shared secret.
 *
 * When `CRON_SECRET` is set in the environment, callers MUST send a matching
 * `x-cron-secret` header (or `?secret=` query string) or the request is
 * rejected with 401. This makes the endpoint safe to expose via plain HTTP
 * cron, GitHub Actions schedule, or any external scheduler.
 *
 * When `CRON_SECRET` is unset (e.g., local development) the endpoint is
 * unguarded. Production deployments MUST set it.
 */
function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  const headerSecret = request.headers.get("x-cron-secret");
  if (headerSecret && headerSecret === secret) return true;

  const querySecret = new URL(request.url).searchParams.get("secret");
  if (querySecret && querySecret === secret) return true;

  // Some platforms (Vercel) send `Authorization: Bearer <secret>` for crons.
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ") && auth.slice(7) === secret) return true;

  return false;
}

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) {
      logger.warn("Unauthorised /api/cron/reminders attempt", {
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
        ua: request.headers.get("user-agent") ?? "unknown",
      });
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = toClinicDay(tomorrow);
    const todayStr = toClinicDay(now);

    let created = 0;

    // 1. Appointment reminders (24h before)
    const upcomingAppts = await prisma.appointment.findMany({
      where: {
        date: new Date(tomorrowStr),
        status: { in: ["SCHEDULED", "CONFIRMED"] },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        doctor: { select: { id: true, name: true } },
      },
    });

    for (const appt of upcomingAppts) {
      // Notify doctor — idempotent via dedupKey unique constraint.
      const dedupKey = `appointment-tomorrow:${appt.appointmentCode}:${todayStr}`;
      const result = await prisma.notification.upsert({
        where: { userId_dedupKey: { userId: appt.doctorId, dedupKey } },
        create: {
          userId: appt.doctorId,
          dedupKey,
          title: `Tomorrow: ${appt.patient.firstName} ${appt.patient.lastName}`,
          message: `${appt.type.replace("_", " ")} at ${appt.startTime} — ${appt.appointmentCode}`,
          type: "APPOINTMENT",
          link: `/calendar`,
        },
        update: {},
      });
      // Prisma upsert doesn't distinguish create-vs-update; rough count
      // via createdAt is fine for telemetry.
      if (Date.now() - result.createdAt.getTime() < 5000) created++;
    }

    // 2. Overdue follow-up reminders
    const overdueFollowUps = await prisma.followUp.findMany({
      where: {
        status: "PENDING",
        dueDate: { lt: now },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        doctor: { select: { id: true } },
      },
    });

    for (const fu of overdueFollowUps) {
      const dedupKey = `followup-overdue:${fu.id}:${todayStr}`;
      const result = await prisma.notification.upsert({
        where: { userId_dedupKey: { userId: fu.doctorId, dedupKey } },
        create: {
          userId: fu.doctorId,
          dedupKey,
          title: `Follow-up overdue: ${fu.patient.firstName} ${fu.patient.lastName}`,
          message: `${fu.reason} — was due ${toClinicDay(fu.dueDate)}`,
          type: "FOLLOW_UP",
          link: `/follow-ups`,
        },
        update: {},
      });
      if (Date.now() - result.createdAt.getTime() < 5000) created++;
    }

    // 3. Package expiry reminders (expiring in 7 days)
    const expiryDate = new Date(now);
    expiryDate.setDate(expiryDate.getDate() + 7);
    const expiringPackages = await prisma.patientPackage.findMany({
      where: {
        status: "ACTIVE",
        expiryDate: { lte: expiryDate, gte: now },
      },
      include: {
        patient: { select: { firstName: true, lastName: true, assignedDoctorId: true } },
      },
    });

    for (const pkg of expiringPackages) {
      if (pkg.patient.assignedDoctorId && pkg.expiryDate) {
        const dedupKey = `package-expiring:${pkg.id}:${todayStr}`;
        const result = await prisma.notification.upsert({
          where: { userId_dedupKey: { userId: pkg.patient.assignedDoctorId, dedupKey } },
          create: {
            userId: pkg.patient.assignedDoctorId,
            dedupKey,
            title: `Package expiring: ${pkg.patient.firstName} ${pkg.patient.lastName}`,
            message: `Expires on ${toClinicDay(pkg.expiryDate)}`,
            type: "SYSTEM",
            link: `/patients`,
          },
          update: {},
        });
        if (Date.now() - result.createdAt.getTime() < 5000) created++;
      }
    }

    // 4. Overdue invoice reminders
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        dueDate: { lt: now },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        createdBy: { select: { id: true } },
      },
    });

    for (const inv of overdueInvoices) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: inv.createdById,
          title: { contains: inv.invoiceNumber },
          createdAt: { gte: new Date(todayStr) },
        },
      });
      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: inv.createdById,
            title: `Invoice overdue: ${inv.invoiceNumber}`,
            message: `${inv.patient.firstName} ${inv.patient.lastName} — Rs ${Number(inv.balanceDue).toLocaleString()} due`,
            type: "BILLING",
            link: `/billing`,
          },
        });
        created++;

        // Also update invoice status to OVERDUE
        if (inv.status !== "OVERDUE") {
          await prisma.invoice.update({ where: { id: inv.id }, data: { status: "OVERDUE" } });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        remindersCreated: created,
        appointmentReminders: upcomingAppts.length,
        overdueFollowUps: overdueFollowUps.length,
        expiringPackages: expiringPackages.length,
        overdueInvoices: overdueInvoices.length,
      },
    });
  } catch (error) {
    logger.api("POST", "/api/cron/reminders", error);
    return NextResponse.json({ success: false, error: "Failed to generate reminders" }, { status: 500 });
  }
}
