/**
 * @route GET /api/portal/data?t=TOKEN
 *
 * Public endpoint — no clinic-user auth required. The token is the
 * credential and scopes the response to a single patient.
 *
 * Returns: { patient (name + code), upcoming appointments, recent invoices,
 *           active prescriptions, pending follow-ups }.
 *
 * This is intentionally read-only and intentionally lean: enough to let
 * a patient see their next visit, balance, and recent Rx — nothing
 * sensitive like notes or audit logs.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bypassTenantScope } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("t")?.trim();
    if (!token) {
      return NextResponse.json({ success: false, error: "missing_token" }, { status: 400 });
    }

    // The portal isn't inside any tenant context — bypass scoping so a
    // single token works regardless of which tenant the patient belongs
    // to. The token itself enforces the scope.
    const data = await bypassTenantScope(async () => {
      const tok = await prisma.patientPortalToken.findUnique({
        where: { token },
        select: { id: true, patientId: true, expiresAt: true, revokedAt: true },
      });
      if (!tok) return null;
      if (tok.revokedAt) return { error: "revoked" as const };
      if (tok.expiresAt && tok.expiresAt < new Date()) return { error: "expired" as const };

      // Update lastUsedAt (best-effort — don't block on it)
      prisma.patientPortalToken
        .update({ where: { id: tok.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {});

      const [patient, appointments, invoices, prescriptions, followUps, documents, treatmentPlans] = await Promise.all([
        prisma.patient.findUnique({
          where: { id: tok.patientId },
          select: {
            id: true, firstName: true, lastName: true, patientCode: true,
            phone: true, email: true, outstandingBalance: true,
          },
        }),
        prisma.appointment.findMany({
          where: { patientId: tok.patientId },
          orderBy: { date: "desc" },
          take: 12,
          select: {
            id: true, appointmentCode: true, date: true,
            startTime: true, endTime: true, type: true, status: true,
            doctor: { select: { name: true } },
          },
        }),
        prisma.invoice.findMany({
          where: { patientId: tok.patientId },
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            id: true, invoiceNumber: true, total: true, amountPaid: true,
            balanceDue: true, status: true, dueDate: true, createdAt: true,
          },
        }),
        prisma.prescription.findMany({
          where: { patientId: tok.patientId },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: {
            id: true, createdAt: true,
            items: { select: { medicineName: true, dosage: true, frequency: true, duration: true } },
          },
        }),
        prisma.followUp.findMany({
          where: { patientId: tok.patientId, status: "PENDING" },
          orderBy: { dueDate: "asc" },
          take: 8,
          select: { id: true, reason: true, dueDate: true, status: true },
        }),
        prisma.patientDocument.findMany({
          where: { patientId: tok.patientId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, name: true, type: true, fileUrl: true, createdAt: true },
        }),
        prisma.treatmentPlan.findMany({
          where: { patientId: tok.patientId },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: {
            id: true, title: true, status: true, totalCost: true,
            estimatedPatientPortion: true, createdAt: true,
            items: { select: { description: true, total: true, status: true } },
          },
        }),
      ]);

      if (!patient) return null;
      return { patient, appointments, invoices, prescriptions, followUps, documents, treatmentPlans };
    });

    if (!data) {
      return NextResponse.json({ success: false, error: "invalid_token" }, { status: 401 });
    }
    if ("error" in data) {
      return NextResponse.json({ success: false, error: data.error }, { status: 401 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    logger.api("GET", "/api/portal/data", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
