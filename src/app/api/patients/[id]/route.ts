/**
 * @system DentaCore ERP - Single Patient API
 * @route GET /api/patients/:id - Get patient details
 * @route PUT /api/patients/:id - Update patient
 * @route DELETE /api/patients/:id - Deactivate patient
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { parsePatientAge, serializePatientAge, touchesAgeFields } from "@/lib/patient-age";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;

    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        allergies: true,
        assignedDoctor: {
          select: { id: true, name: true, speciality: true, avatar: true },
        },
        branch: {
          select: { id: true, name: true, code: true },
        },
        medicalHistory: true,
        skinHistory: true,
      },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Patient not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: serializePatientAge(patient) });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch patient" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();

    // Check existence
    const existing = await prisma.patient.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Patient not found" },
        { status: 404 }
      );
    }

    // DOB and age are written as a pair so the two can never disagree; only
    // parse when the caller actually sends one of them.
    let ageFields = null;
    if (touchesAgeFields(body)) {
      const parsed = parsePatientAge(body);
      if (!parsed.ok) {
        return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
      }
      ageFields = parsed.data;
    }

    const updated = await prisma.patient.update({
      where: { id },
      data: {
        ...(ageFields ?? {}),
        ...(body.firstName !== undefined && { firstName: body.firstName }),
        ...(body.lastName !== undefined && { lastName: body.lastName }),
        ...(body.middleName !== undefined && { middleName: body.middleName }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.gender !== undefined && { gender: body.gender }),
        ...(body.nationality !== undefined && {
          nationality: body.nationality,
        }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.emergencyContact !== undefined && {
          emergencyContact: body.emergencyContact,
        }),
        ...(body.emergencyPhone !== undefined && {
          emergencyPhone: body.emergencyPhone,
        }),
        ...(body.bloodType !== undefined && { bloodType: body.bloodType }),
        ...(body.skinType !== undefined && { skinType: body.skinType }),
        ...(body.branchId !== undefined && { branchId: body.branchId }),
        ...(body.assignedDoctorId !== undefined && {
          assignedDoctorId: body.assignedDoctorId,
        }),
        ...(body.profileImage !== undefined && {
          profileImage: body.profileImage,
        }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.source !== undefined && { source: body.source }),
        ...(body.consentGiven !== undefined && {
          consentGiven: body.consentGiven,
        }),
        ...(body.isVip !== undefined && { isVip: body.isVip }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      include: {
        assignedDoctor: {
          select: { id: true, name: true, speciality: true },
        },
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    await logAudit({
      userId: body.updatedById || "system",
      action: "UPDATE",
      module: "PATIENT",
      entityType: "Patient",
      entityId: updated.id,
      details: { patientCode: updated.patientCode },
    });

    return NextResponse.json({ success: true, data: serializePatientAge(updated) });
  } catch (error) {
    logger.api("PUT", "/api/patients/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to update patient" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;

    const existing = await prisma.patient.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Patient not found" },
        { status: 404 }
      );
    }

    const deactivated = await prisma.patient.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });

    await logAudit({
      userId: "system",
      action: "DEACTIVATE",
      module: "PATIENT",
      entityType: "Patient",
      entityId: deactivated.id,
      details: { patientCode: deactivated.patientCode },
    });

    return NextResponse.json({ success: true, data: deactivated });
  } catch (error) {
    logger.api("DELETE", "/api/patients/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to deactivate patient" },
      { status: 500 }
    );
  }
}
