/**
 * @system DentaCore ERP — Caller Match API
 * @route GET /api/calls/match?phone=xxx — Match incoming number to patient/lead
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "").slice(-10);
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get("phone");

    if (!phone) {
      return NextResponse.json({ success: false, error: "Phone number required" }, { status: 400 });
    }

    const normalized = normalizePhone(phone);

    // 1. Search patients by exact and normalized phone
    const patients = await prisma.patient.findMany({
      where: {
        OR: [
          { phone: { contains: normalized } },
          { phone: { contains: phone } },
          { emergencyPhone: { contains: normalized } },
        ],
        isActive: true,
      },
      select: {
        id: true, patientCode: true, firstName: true, lastName: true, phone: true,
        gender: true, dateOfBirth: true, age: true, ageRecordedAt: true, email: true,
        assignedDoctor: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        allergies: { select: { allergen: true } },
        tags: { select: { tag: true } },
      },
      take: 3,
    });

    // 2. Search leads
    const leads = await prisma.lead.findMany({
      where: {
        OR: [
          { phone: { contains: normalized } },
          { phone: { contains: phone } },
        ],
      },
      select: {
        id: true, name: true, phone: true, email: true, source: true, status: true,
        interest: true, notes: true, callbackDate: true,
        assignedTo: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
      take: 3,
    });

    // 3. Get recent appointments for matched patients
    let recentAppointments: Record<string, unknown>[] = [];
    if (patients.length > 0) {
      recentAppointments = await prisma.appointment.findMany({
        where: { patientId: patients[0].id },
        select: { id: true, date: true, startTime: true, type: true, status: true, doctor: { select: { name: true } } },
        orderBy: { date: "desc" },
        take: 3,
      });
    }

    // 4. Get recent call logs for this number
    const recentCalls = await prisma.callLog.findMany({
      where: {
        OR: [
          ...(patients.length > 0 ? [{ patientId: patients[0].id }] : []),
          ...(leads.length > 0 ? [{ leadId: leads[0].id }] : []),
        ],
      },
      select: { id: true, type: true, outcome: true, notes: true, duration: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // Determine match type
    const matchType = patients.length > 0 ? "patient" : leads.length > 0 ? "lead" : "none";

    return NextResponse.json({
      success: true,
      data: {
        matchType,
        phone,
        patient: patients[0] || null,
        otherPatients: patients.slice(1),
        lead: leads[0] || null,
        otherLeads: leads.slice(1),
        recentAppointments,
        recentCalls,
      },
    });
  } catch (error) {
    logger.api("GET", "/api/calls/match", error);
    return NextResponse.json({ success: false, error: "Match failed" }, { status: 500 });
  }
}
