/**
 * @route GET /api/patients/[id]/doctor-summary
 * Consolidated patient briefing for the doctor app's patient summary
 * screen. One round trip returns: identity, allergies, vitals snapshot,
 * latest note + Rx, problem teeth, open treatment plan, financial state.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { resolvePatientAge } from "@/lib/utils";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        allergies: true,
        tags: { select: { tag: true } },
        assignedDoctor: { select: { id: true, name: true } },
      },
    });
    if (!patient) {
      return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    }

    const [lastNote, latestRx, latestTriage, problemTeeth, openPlan, openInvoices, todayAppt, nextAppt] = await Promise.all([
      prisma.consultationNote.findFirst({
        where: { patientId: id },
        orderBy: { createdAt: "desc" },
        select: { chiefComplaint: true, diagnosis: true, treatmentPlan: true, advice: true, createdAt: true, doctor: { select: { name: true } } },
      }),
      prisma.prescription.findFirst({
        where: { patientId: id },
        orderBy: { createdAt: "desc" },
        include: { items: { select: { medicineName: true, dosage: true, frequency: true, duration: true } } },
      }),
      prisma.triage.findFirst({
        where: { patientId: id },
        orderBy: { createdAt: "desc" },
        select: {
          temperature: true, systolicBP: true, diastolicBP: true, heartRate: true,
          oxygenSaturation: true, painLevel: true, urgencyLevel: true, createdAt: true,
        },
      }),
      prisma.toothRecord.findMany({
        where: { patientId: id, status: { notIn: ["HEALTHY", "TREATED"] } },
        select: { fdi: true, status: true, conditions: true, plannedTreatment: true, priority: true },
        orderBy: { fdi: "asc" },
        take: 20,
      }),
      prisma.treatmentPlan.findFirst({
        where: { patientId: id, status: { in: ["PROPOSED", "ACCEPTED", "IN_PROGRESS"] } },
        orderBy: { createdAt: "desc" },
        include: {
          items: { select: { id: true, description: true, status: true, total: true, fdi: true } },
        },
      }),
      prisma.invoice.findMany({
        where: { patientId: id, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } },
        select: { id: true, invoiceNumber: true, total: true, balanceDue: true, status: true, dueDate: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      // Today's appointment (clinic-local: any appt with date == today)
      prisma.appointment.findFirst({
        where: {
          patientId: id,
          date: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt:  new Date(new Date().setHours(24, 0, 0, 0)),
          },
          status: { notIn: ["CANCELLED", "NO_SHOW", "COMPLETED"] },
        },
        select: { id: true, startTime: true, endTime: true, type: true, status: true, doctorId: true },
        orderBy: { startTime: "asc" },
      }),
      prisma.appointment.findFirst({
        where: {
          patientId: id,
          date: { gt: new Date() },
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
        },
        select: { id: true, date: true, startTime: true, type: true, doctor: { select: { name: true } } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      }),
    ]);

    const outstandingBalance = openInvoices.reduce((s, i) => s + (i.balanceDue ?? 0), 0);
    const age = resolvePatientAge(patient);

    return NextResponse.json({
      success: true,
      data: {
        patient: {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          patientCode: patient.patientCode,
          gender: patient.gender,
          age,
          phone: patient.phone,
          email: patient.email,
          bloodType: patient.bloodType,
          isVip: patient.isVip,
          profileImage: patient.profileImage,
          assignedDoctor: patient.assignedDoctor,
          tags: patient.tags.map((t) => t.tag),
        },
        allergies: patient.allergies.map((a) => ({ allergen: a.allergen, severity: a.severity })),
        lastNote,
        latestRx,
        latestTriage,
        problemTeeth,
        openPlan: openPlan
          ? {
              id: openPlan.id,
              title: openPlan.title,
              status: openPlan.status,
              totalCost: openPlan.totalCost,
              estimatedPatientPortion: openPlan.estimatedPatientPortion,
              items: openPlan.items,
              completedCount: openPlan.items.filter((i) => i.status === "COMPLETED").length,
            }
          : null,
        finance: {
          outstandingBalance,
          openInvoices,
        },
        todayAppt,
        nextAppt,
      },
    });
  } catch (err) {
    logger.api("GET", `/api/patients/${id}/doctor-summary`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
