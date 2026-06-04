/* eslint-disable no-var */
import { PrismaClient, Prisma } from "@prisma/client";
import { getCurrentTenantId, isTenantScopeBypassed } from "./tenant-context";

declare global {
  var __prisma: PrismaClient | undefined;
}

/**
 * Models that carry a tenantId column. The Prisma extension applies a
 * WHERE filter on reads and injects tenantId on creates for any model in
 * this set. Keep in sync with the schema.
 */
const TENANT_SCOPED_MODELS = new Set<string>([
  // Phase A
  "Branch", "User", "Patient", "Treatment", "Package", "Lead", "Room",
  "Product", "Setting",
  // Phase B
  "Appointment", "Invoice", "Procedure", "ConsultationNote",
  "AuditLog", "Notification", "FollowUp", "ToothRecord",
  "VoiceNote",
]);

const READ_OPS = new Set<string>([
  "findFirst", "findFirstOrThrow", "findMany", "findUnique", "findUniqueOrThrow",
  "count", "aggregate", "groupBy",
]);

const CREATE_OPS = new Set<string>(["create", "createMany"]);

function shouldScope(model: string | undefined, operation: string): boolean {
  if (!model || !TENANT_SCOPED_MODELS.has(model)) return false;
  if (isTenantScopeBypassed()) return false;
  return READ_OPS.has(operation) || CREATE_OPS.has(operation);
}

/**
 * Strict mode toggles between two scoping semantics:
 *
 *   Permissive (default): tenantId === current OR tenantId IS NULL.
 *     Useful while a deployment still has un-backfilled legacy rows so
 *     they remain visible. Carries some cross-tenant leakage risk if
 *     ANY row was created without a tenantId (singletons aside).
 *
 *   Strict (`TENANT_STRICT=1`): tenantId === current only.
 *     Safe-by-default — once the deployment has confirmed all rows in
 *     tenanted models carry a tenantId, flip this on and the extension
 *     will refuse to surface any rogue NULL-tenant rows.
 *
 * Always opt INTO permissive mode explicitly when running in production
 * by leaving `TENANT_STRICT` unset; we treat strict as Phase C target.
 */
const STRICT_TENANT = process.env.TENANT_STRICT === "1" || process.env.TENANT_STRICT === "true";

function applyTenantFilter(args: Record<string, unknown> | undefined, tenantId: string): Record<string, unknown> {
  const next = { ...(args ?? {}) };
  const tenantClause = STRICT_TENANT
    ? { tenantId }
    : { OR: [{ tenantId }, { tenantId: null }] };
  if (next.where && typeof next.where === "object") {
    next.where = { AND: [next.where, tenantClause] };
  } else {
    next.where = tenantClause;
  }
  return next;
}

function injectTenantOnCreate(
  args: Record<string, unknown> | undefined,
  operation: string,
  tenantId: string,
): Record<string, unknown> {
  const next = { ...(args ?? {}) };
  if (operation === "createMany") {
    const data = next.data;
    if (Array.isArray(data)) {
      next.data = data.map((row) =>
        typeof row === "object" && row !== null && !("tenantId" in row)
          ? { ...row, tenantId }
          : row
      );
    }
  } else {
    const data = next.data;
    if (data && typeof data === "object" && !("tenantId" in (data as object))) {
      next.data = { ...(data as object), tenantId };
    }
  }
  return next;
}

function buildExtendedClient(client: PrismaClient): PrismaClient {
  return client.$extends({
    name: "tenantScope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!shouldScope(model, operation)) {
            return query(args);
          }
          const tenantId = getCurrentTenantId();
          if (!tenantId) return query(args);

          let nextArgs = args as Record<string, unknown> | undefined;
          if (READ_OPS.has(operation)) {
            nextArgs = applyTenantFilter(nextArgs, tenantId);
          } else if (CREATE_OPS.has(operation)) {
            nextArgs = injectTenantOnCreate(nextArgs, operation, tenantId);
          }
          // Cast back to the operation's discriminated union — we've
          // augmented a Record so TS can't see it's still valid.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return query(nextArgs as any);
        },
      },
    },
  }) as unknown as PrismaClient;
}

const base = globalThis.__prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.__prisma = base;

export const prisma = buildExtendedClient(base);
export type { Prisma };
