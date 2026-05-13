/**
 * @system DentaCore ERP - Single Appointment API
 * @route GET /api/appointments/:id - Get appointment
 * @route PUT /api/appointments/:id - Update appointment
 * @route DELETE /api/appointments/:id - Cancel appointment
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true, profileImage: true } },
        doctor: { select: { id: true, name: true, speciality: true, avatar: true } },
        branch: { select: { id: true, name: true, code: true } },
        room: { select: { id: true, name: true, number: true } },
        consultationNote: true,
        procedures: true,
        prescriptions: { include: { items: true } },
        labTests: true,
        followUps: true,
      },
    });

    if (!appointment) {
      return NextResponse.json(
        { success: false, error: "Appointment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: appointment });
  } catch (error) {
    logger.api("GET", "/api/appointments/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch appointment" },
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

    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Appointment not found" },
        { status: 404 }
      );
    }

    // Validate status transitions (state machine in src/lib/state/appointment-transitions.ts)
    if (body.status) {
      const { isAppointmentStatus, isValidTransition } = await import("@/lib/state/appointment-transitions");
      if (!isAppointmentStatus(body.status) || !isAppointmentStatus(existing.status)) {
        return NextResponse.json(
          { success: false, error: `Unknown appointment status: ${body.status}` },
          { status: 400 }
        );
      }
      if (!isValidTransition(existing.status, body.status)) {
        return NextResponse.json(
          { success: false, error: `Cannot transition from ${existing.status} to ${body.status}` },
          { status: 400 }
        );
      }
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        ...(body.doctorId && { doctorId: body.doctorId }),
        ...(body.roomId !== undefined && { roomId: body.roomId || null }),
        ...(body.date && { date: new Date(body.date) }),
        ...(body.startTime && { startTime: body.startTime }),
        ...(body.endTime && { endTime: body.endTime }),
        ...(body.durationMinutes && { durationMinutes: body.durationMinutes }),
        ...(body.type && { type: body.type }),
        ...(body.status && { status: body.status }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.priority && { priority: body.priority }),
        ...(body.workflowStage && { workflowStage: body.workflowStage }),
        ...(body.cancellationNote && { cancellationNote: body.cancellationNote }),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        doctor: { select: { id: true, name: true, speciality: true } },
      },
    });

    return NextResponse.json({ success: true, data: appointment });
  } catch (error) {
    logger.api("PUT", "/api/appointments/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to update appointment" },
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

    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Appointment not found" },
        { status: 404 }
      );
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ success: true, data: appointment });
  } catch (error) {
    logger.api("DELETE", "/api/appointments/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to cancel appointment" },
      { status: 500 }
    );
  }
}
