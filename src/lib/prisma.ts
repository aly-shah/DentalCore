/* eslint-disable no-var */
import { PrismaClient, Prisma } from "@prisma/client";
import { getCurrentTenantId, isTenantScopeBypassed } from "./tenant-context";

declare global {
  var __prisma: PrismaClient | undefined;
}

/**
 * Models that carry a tenantId column. The Prisma extension applies a
 * WHERE filter on reads/updates/deletes and injects tenantId on creates
 * for any model in this set. Keep in sync with the schema — the test in
 * prisma.test.ts asserts every tenantId-bearing model is listed here.
 *
 * Deliberately EXCLUDED: `TenantHostname`. It maps hostnames -> tenants and
 * is a platform-level concern (global uniqueness checks, admin-only CRUD via
 * bypassTenantScope), so auto-scoping it would break tenant resolution.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  // Phase A
  "Branch", "User", "Patient", "Treatment", "Package", "Lead", "Room",
  "Product", "Setting",
  // Phase B
  "Appointment", "Invoice", "Procedure", "ConsultationNote",
  "AuditLog", "Notification", "FollowUp", "ToothRecord",
  "VoiceNote",
  // Phase B (previously missing — were carrying tenantId with NO enforcement)
  "DentalChart", "TreatmentPlan", "TreatmentTemplate", "BlockedSlot",
  "BookingRequest", "PaymentSession", "AISuggestionLog",
  "UnmatchedInboundMessage",
]);

/**
 * Operations are split by the shape of their `where` argument:
 *
 *  - READ_FILTER_OPS / WRITE_FILTER_OPS take a regular WhereInput, so the
 *    tenant clause is added by AND-wrapping the whole where.
 *  - UNIQUE_WHERE_OPS take a WhereUniqueInput, which REQUIRES at least one
 *    unique field at the top level. We must NOT AND-wrap those (Prisma
 *    rejects `{ AND: [...] }` with no top-level unique field); instead we
 *    merge the tenant clause as an extra top-level `AND` alongside the
 *    unique selector. A cross-tenant target then surfaces as P2025
 *    (record not found) on update/delete and null on findUnique.
 *  - CREATE_OPS inject tenantId into the data payload.
 *  - upsert is both: scope the where (unique) AND inject tenantId on create.
 */
const READ_FILTER_OPS = new Set<string>([
  "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy",
]);
const UNIQUE_WHERE_OPS = new Set<string>([
  "findUnique", "findUniqueOrThrow", "update", "delete",
]);
const WRITE_FILTER_OPS = new Set<string>(["updateMany", "deleteMany"]);
const CREATE_OPS = new Set<string>(["create", "createMany"]);

/** True if this (model, operation) pair should be tenant-scoped at all. */
export function isTenantScopedOperation(model: string | undefined, operation: string): boolean {
  if (!model || !TENANT_SCOPED_MODELS.has(model)) return false;
  return (
    READ_FILTER_OPS.has(operation) ||
    UNIQUE_WHERE_OPS.has(operation) ||
    WRITE_FILTER_OPS.has(operation) ||
    CREATE_OPS.has(operation) ||
    operation === "upsert"
  );
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

type AnyArgs = Record<string, unknown> | undefined;

function tenantClause(tenantId: string, strict: boolean): Record<string, unknown> {
  return strict ? { tenantId } : { OR: [{ tenantId }, { tenantId: null }] };
}

/** Collection ops: AND-wrap the whole where with the tenant clause. */
function andWrapWhere(args: AnyArgs, clause: Record<string, unknown>): Record<string, unknown> {
  const next = { ...(args ?? {}) };
  if (next.where && typeof next.where === "object") {
    next.where = { AND: [next.where, clause] };
  } else {
    next.where = clause;
  }
  return next;
}

/**
 * Unique-where ops: keep the caller's unique selector at the top level and
 * append the tenant clause via `AND`, preserving any existing AND entries.
 * If there is no where (Prisma will reject that itself), leave it untouched.
 */
function mergeUniqueWhere(args: AnyArgs, clause: Record<string, unknown>): Record<string, unknown> {
  const next = { ...(args ?? {}) };
  if (!next.where || typeof next.where !== "object") return next;
  const where = { ...(next.where as Record<string, unknown>) };
  const existing = where.AND;
  const existingAnd = Array.isArray(existing) ? existing : existing != null ? [existing] : [];
  where.AND = [...existingAnd, clause];
  next.where = where;
  return next;
}

function injectTenantOnData(
  args: AnyArgs,
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
          : row,
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

/**
 * Pure transformation: given an operation + its args + the active tenant,
 * return args with the tenant scope applied. No I/O — unit-tested directly
 * in prisma.test.ts. The extension below is a thin wrapper around this.
 */
export function scopeQueryArgs(opts: {
  operation: string;
  args: AnyArgs;
  tenantId: string;
  strict?: boolean;
}): AnyArgs {
  const { operation, args, tenantId } = opts;
  const strict = opts.strict ?? STRICT_TENANT;
  const clause = tenantClause(tenantId, strict);

  if (READ_FILTER_OPS.has(operation) || WRITE_FILTER_OPS.has(operation)) {
    return andWrapWhere(args, clause);
  }
  if (UNIQUE_WHERE_OPS.has(operation)) {
    return mergeUniqueWhere(args, clause);
  }
  if (CREATE_OPS.has(operation)) {
    return injectTenantOnData(args, operation, tenantId);
  }
  if (operation === "upsert") {
    // Scope the unique where AND tag the create payload.
    const scoped = mergeUniqueWhere(args, clause);
    const create = scoped.create;
    if (create && typeof create === "object" && !("tenantId" in (create as object))) {
      scoped.create = { ...(create as object), tenantId };
    }
    return scoped;
  }
  return args;
}

function buildExtendedClient(client: PrismaClient): PrismaClient {
  return client.$extends({
    name: "tenantScope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (isTenantScopeBypassed()) return query(args);
          if (!isTenantScopedOperation(model, operation)) return query(args);
          const tenantId = getCurrentTenantId();
          if (!tenantId) return query(args);

          const nextArgs = scopeQueryArgs({
            operation,
            args: args as AnyArgs,
            tenantId,
          });
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
