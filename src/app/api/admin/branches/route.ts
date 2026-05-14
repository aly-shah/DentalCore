/**
 * @system DentaCore ERP - Admin Branches API
 * @route GET /api/admin/branches - List branches
 * @route POST /api/admin/branches - Create branch
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (active === "true") where.isActive = true;
    else if (active === "false") where.isActive = false;

    const branches = await prisma.branch.findMany({
      where,
      include: {
        _count: { select: { users: true, patients: true, rooms: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: branches });
  } catch (error) {
    logger.api("GET", "/api/admin/branches", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch branches" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const body = await request.json();

    // Check for duplicate code (Branch.code isn't @unique in the schema,
    // so use findFirst — we still want to surface a friendly 409.)
    const existing = await prisma.branch.findFirst({ where: { code: body.code } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "A branch with this code already exists" },
        { status: 409 }
      );
    }

    const branch = await prisma.branch.create({
      data: {
        name: body.name,
        code: body.code,
        address: body.address,
        phone: body.phone,
        email: body.email,
        timezone: body.timezone || "UTC",
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, data: branch }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/admin/branches", error);
    return NextResponse.json(
      { success: false, error: "Failed to create branch" },
      { status: 500 }
    );
  }
}
