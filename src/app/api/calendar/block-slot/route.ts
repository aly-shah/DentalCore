/**
 * @route GET  /api/calendar/block-slot — list (filter by date range + doctor/room/branch)
 * @route POST /api/calendar/block-slot — create a blocked slot
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const createSchema = z.object({
  doctorId: z.string().optional().nullable(),
  roomId:   z.string().optional().nullable(),
  branchId: z.string().optional().nullable(),
  date:     z.string(), // YYYY-MM-DD
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime:   z.string().regex(/^\d{2}:\d{2}$/),
  type:     z.enum(["BLOCK", "BREAK", "MAINTENANCE", "MEETING"]).default("BLOCK"),
  reason:   z.string().max(500).optional().nullable(),
});

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from"); // YYYY-MM-DD inclusive
    const to   = searchParams.get("to");   // YYYY-MM-DD inclusive
    const doctorId = searchParams.get("doctorId") ?? undefined;
    const roomId   = searchParams.get("roomId") ?? undefined;
    const branchId = searchParams.get("branchId") ?? undefined;

    const where: Record<string, unknown> = {};
    if (from || to) {
      where.date = {
        ...(from && { gte: new Date(from) }),
        ...(to   && { lte: new Date(to) }),
      };
    }
    if (doctorId) where.doctorId = doctorId;
    if (roomId)   where.roomId   = roomId;
    if (branchId) where.branchId = branchId;

    const blocks = await prisma.blockedSlot.findMany({
      where,
      include: {
        doctor: { select: { id: true, name: true } },
        room:   { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 200,
    });
    return NextResponse.json({ success: true, data: blocks });
  } catch (err) {
    logger.api("GET", "/api/calendar/block-slot", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR"] });
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { date, ...rest } = parsed.data;
    if (rest.startTime >= rest.endTime) {
      return NextResponse.json(
        { success: false, error: "startTime must be before endTime" },
        { status: 400 }
      );
    }
    const block = await prisma.blockedSlot.create({
      data: { ...rest, date: new Date(date) },
      include: {
        doctor: { select: { id: true, name: true } },
        room:   { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ success: true, data: block }, { status: 201 });
  } catch (err) {
    logger.api("POST", "/api/calendar/block-slot", err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
