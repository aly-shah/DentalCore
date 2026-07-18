/**
 * @system DentaCore ERP - Patient List & Creation API
 * @route GET /api/patients - List patients with search/filter
 * @route POST /api/patients - Create a new patient
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { parsePatientAge, serializePatientAge } from "@/lib/patient-age";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.toLowerCase();
    const branchId = searchParams.get("branchId");
    const doctorId = searchParams.get("doctorId");
    const status = searchParams.get("status"); // "active" | "inactive"
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const where: Prisma.PatientWhereInput = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { patientCode: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (branchId) {
      where.branchId = branchId;
    }

    if (doctorId) {
      where.assignedDoctorId = doctorId;
    }

    if (status === "active") {
      where.isActive = true;
    } else if (status === "inactive") {
      where.isActive = false;
    }

    // Relation filters: by treatment (performed procedure or planned item),
    // by ortho/braces (has any ortho case), and by patient tag.
    const treatmentId = searchParams.get("treatmentId");
    const ortho = searchParams.get("ortho");
    const tag = searchParams.get("tag");
    const relFilters: Prisma.PatientWhereInput[] = [];
    if (treatmentId) {
      relFilters.push({
        OR: [
          { procedures: { some: { treatmentId } } },
          { treatmentPlans: { some: { items: { some: { treatmentId } } } } },
        ],
      });
    }
    if (ortho === "true") relFilters.push({ orthoCases: { some: {} } });
    if (tag) relFilters.push({ tags: { some: { tag } } });
    if (relFilters.length) where.AND = relFilters;

    const [data, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          assignedDoctor: {
            select: { id: true, name: true, speciality: true },
          },
          branch: {
            select: { id: true, name: true, code: true },
          },
        },
      }),
      prisma.patient.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: data.map(serializePatientAge),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.api("GET", "/api/patients", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch patients" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();

    // Auto-generate patientCode. Two concurrent POSTs can read the same
    // "last" value and race for the same PT-NNNN; the @unique constraint
    // catches it, so we retry a few times on P2002 before giving up.
    async function nextPatientCode(): Promise<string> {
      const last = await prisma.patient.findFirst({
        orderBy: { patientCode: "desc" },
        select: { patientCode: true },
      });
      const n = last ? parseInt(last.patientCode.replace("PT-", ""), 10) + 1 : 1;
      return `PT-${String(n).padStart(4, "0")}`;
    }

    // Validate required fields
    if (!body.firstName || !body.lastName || !body.phone || !body.gender) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: firstName, lastName, phone, gender" },
        { status: 400 }
      );
    }

    // Age is recorded as either an exact DOB or an approximate age.
    const ageFields = parsePatientAge(body);
    if (!ageFields.ok) {
      return NextResponse.json({ success: false, error: ageFields.error }, { status: 400 });
    }

    // Ensure branchId — fall back to first active branch if not provided
    let branchId = body.branchId;
    if (!branchId) {
      const defaultBranch = await prisma.branch.findFirst({ where: { isActive: true }, select: { id: true } });
      if (!defaultBranch) {
        return NextResponse.json(
          { success: false, error: "No active branch found. Please create a branch first." },
          { status: 400 }
        );
      }
      branchId = defaultBranch.id;
    }

    // Retry on P2002 (duplicate patientCode) to handle concurrent creates.
    let patient: Awaited<ReturnType<typeof prisma.patient.create>> | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5 && !patient; attempt++) {
      const patientCode = await nextPatientCode();
      try {
        patient = await prisma.patient.create({
          data: {
            patientCode,
            firstName: body.firstName,
        lastName: body.lastName,
        middleName: body.middleName || null,
        email: body.email || null,
        phone: body.phone,
        ...ageFields.data,
        gender: body.gender,
        nationality: body.nationality || null,
        address: body.address || null,
        city: body.city || null,
        emergencyContact: body.emergencyContact || null,
        emergencyPhone: body.emergencyPhone || null,
        bloodType: body.bloodType || null,
        skinType: body.skinType || null,
        branchId,
        assignedDoctorId: body.assignedDoctorId,
        profileImage: body.profileImage,
        notes: body.notes,
        source: body.source,
        consentGiven: body.consentGiven ?? false,
        isVip: body.isVip ?? false,
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
      } catch (e: unknown) {
        lastError = e;
        const code = (e as { code?: string })?.code;
        if (code !== "P2002") break; // not a unique-constraint race — bail
        // otherwise loop and try the next code
      }
    }
    if (!patient) {
      logger.api("POST", "/api/patients", lastError);
      return NextResponse.json(
        { success: false, error: "Failed to assign a unique patient code after retries" },
        { status: 500 }
      );
    }

    await logAudit({
      userId: body.createdById || "system",
      action: "CREATE",
      module: "PATIENT",
      entityType: "Patient",
      entityId: patient.id,
      details: { patientCode: patient.patientCode },
    });

    return NextResponse.json(
      { success: true, data: serializePatientAge(patient) },
      { status: 201 }
    );
  } catch (error) {
    logger.api("POST", "/api/patients", error);
    return NextResponse.json(
      { success: false, error: "Failed to create patient" },
      { status: 500 }
    );
  }
}
