import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

/** Resolve the public origin for portal links (env first, request host fallback). */
export function portalOrigin(request?: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (request) {
    try {
      const u = new URL(request.url);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* fall through */
    }
  }
  return "";
}

/**
 * Mint a patient-portal magic link. The token IS the credential — anyone with
 * the link can view the patient's records — so only send it to the patient's
 * own phone/email. Mirrors the /admin/patients/[id]/portal-link route so the
 * two stay in sync.
 */
export async function createPortalLink(opts: {
  patientId: string;
  createdById: string;
  origin: string;
  expiresInDays?: number;
}): Promise<string> {
  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + (opts.expiresInDays ?? 90) * 86400 * 1000);
  await prisma.patientPortalToken.create({
    data: {
      patientId: opts.patientId,
      token,
      expiresAt,
      createdById: opts.createdById,
    },
  });
  return `${opts.origin}/portal?t=${token}`;
}
