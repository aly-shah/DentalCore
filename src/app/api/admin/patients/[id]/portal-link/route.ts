/**
 * @route POST /api/admin/patients/[id]/portal-link
 *
 * Generates a new portal-access token for the patient and returns the
 * full URL. The token IS the credential — anyone with the link can view
 * the patient's records — so the link should be sent over the patient's
 * known phone/email and revoked if compromised.
 *
 * Generating a new link does NOT revoke previous links; pass
 * `{ revokeExisting: true }` to invalidate all prior tokens first.
 *
 * @route DELETE /api/admin/patients/[id]/portal-link?token=...
 *   Revokes a specific token (or all active tokens if `token` is omitted).
 */
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const schema = z.object({
  revokeExisting: z.boolean().optional().default(false),
  expiresInDays: z.number().int().min(1).max(365).optional().default(90),
});

function originFromRequest(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST"] });
  if (auth.response) return auth.response;

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "validation_failed", fields: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { revokeExisting, expiresInDays } = parsed.data;

    const patient = await prisma.patient.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, deletedAt: true },
    });
    if (!patient || patient.deletedAt) {
      return NextResponse.json({ success: false, error: "patient_not_found" }, { status: 404 });
    }

    if (revokeExisting) {
      await prisma.patientPortalToken.updateMany({
        where: { patientId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const token = crypto.randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + expiresInDays * 86400 * 1000);
    const row = await prisma.patientPortalToken.create({
      data: {
        patientId: id,
        token,
        expiresAt,
        createdById: auth.user.id,
      },
      select: { id: true, token: true, expiresAt: true, createdAt: true },
    });

    const url = `${originFromRequest(request)}/portal?t=${row.token}`;
    return NextResponse.json({
      success: true,
      data: { id: row.id, url, expiresAt: row.expiresAt },
    }, { status: 201 });
  } catch (err) {
    logger.api("POST", `/api/admin/patients/${id}/portal-link`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    const result = token
      ? await prisma.patientPortalToken.updateMany({
          where: { patientId: id, token, revokedAt: null },
          data: { revokedAt: new Date() },
        })
      : await prisma.patientPortalToken.updateMany({
          where: { patientId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });

    return NextResponse.json({ success: true, data: { revoked: result.count } });
  } catch (err) {
    logger.api("DELETE", `/api/admin/patients/${id}/portal-link`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST"] });
  if (auth.response) return auth.response;
  const { id } = await params;

  try {
    const rows = await prisma.patientPortalToken.findMany({
      where: { patientId: id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true, expiresAt: true, lastUsedAt: true, createdAt: true },
    });
    const origin = originFromRequest(request);
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        url: `${origin}/portal?t=${r.token}`,
        token: r.token.slice(0, 6) + "…",
        expiresAt: r.expiresAt,
        lastUsedAt: r.lastUsedAt,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    logger.api("GET", `/api/admin/patients/${id}/portal-link`, err);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
