/**
 * Per-request tenant context.
 *
 * Each authenticated request seeds an AsyncLocalStorage value with the
 * caller's tenantId. The Prisma extension in src/lib/prisma.ts reads
 * this context to auto-filter reads and inject tenantId on writes for
 * the multi-tenant ("Phase B") models.
 *
 * If the store is unset, the extension is a no-op — preserving the
 * current behaviour for cron jobs, scripts, and pre-auth routes.
 */
import { AsyncLocalStorage } from "node:async_hooks";

interface TenantStore {
  tenantId: string | null;
  /** When true, the extension's read filter is bypassed for this request. */
  bypassTenantScope?: boolean;
}

const tenantStorage = new AsyncLocalStorage<TenantStore>();

/**
 * Seed the tenant context for the current async context.
 *
 * `.enterWith` is the right tool here because Next.js route handlers
 * already run inside a request-scoped async context; we just need to
 * attach our value to it. The value propagates to every awaited call
 * (Prisma queries, downstream helpers) inside the same request.
 */
export function setCurrentTenant(tenantId: string | null): void {
  tenantStorage.enterWith({ tenantId });
}

/**
 * Run a callback with the given tenant context. Use this for code paths
 * that don't have a request-scoped async context (e.g., cron handlers
 * that fan-out into worker promises).
 */
export function runWithTenant<T>(
  tenantId: string | null,
  fn: () => Promise<T>,
  opts?: { bypassTenantScope?: boolean }
): Promise<T> {
  return tenantStorage.run({ tenantId, bypassTenantScope: opts?.bypassTenantScope }, fn);
}

/** Read the active tenantId, or null if none set / unscoped context. */
export function getCurrentTenantId(): string | null {
  return tenantStorage.getStore()?.tenantId ?? null;
}

/**
 * Should the Prisma extension skip its where-clause injection?
 *
 * Used by internal callers (cron jobs, the platform admin console, the
 * tenant backfill script) that legitimately need to see cross-tenant data.
 */
export function isTenantScopeBypassed(): boolean {
  return tenantStorage.getStore()?.bypassTenantScope === true;
}

/** Convenience for admin/cron contexts that need full visibility. */
export function bypassTenantScope<T>(fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({ tenantId: null, bypassTenantScope: true }, fn);
}
