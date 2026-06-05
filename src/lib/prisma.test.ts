import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TENANT_SCOPED_MODELS,
  isTenantScopedOperation,
  scopeQueryArgs,
} from "./prisma";

const TID = "tenant-a";

describe("scopeQueryArgs — collection reads (WhereInput, AND-wrapped)", () => {
  for (const op of ["findFirst", "findMany", "count", "aggregate", "groupBy"]) {
    it(`${op}: AND-wraps an existing where with the permissive tenant clause`, () => {
      const out = scopeQueryArgs({ operation: op, args: { where: { isActive: true } }, tenantId: TID });
      expect(out).toEqual({
        where: { AND: [{ isActive: true }, { OR: [{ tenantId: TID }, { tenantId: null }] }] },
      });
    });
  }

  it("adds a where when none was provided", () => {
    const out = scopeQueryArgs({ operation: "findMany", args: {}, tenantId: TID });
    expect(out).toEqual({ where: { OR: [{ tenantId: TID }, { tenantId: null }] } });
  });

  it("strict mode filters on tenantId only (no NULL fallback)", () => {
    const out = scopeQueryArgs({ operation: "findMany", args: { where: { isActive: true } }, tenantId: TID, strict: true });
    expect(out).toEqual({ where: { AND: [{ isActive: true }, { tenantId: TID }] } });
  });
});

describe("scopeQueryArgs — unique-where ops (must keep a top-level unique field)", () => {
  for (const op of ["findUnique", "findUniqueOrThrow", "update", "delete"]) {
    it(`${op}: merges the clause via top-level AND, leaving the unique id in place`, () => {
      const out = scopeQueryArgs({ operation: op, args: { where: { id: "x" }, data: { name: "n" } }, tenantId: TID });
      // id stays at the top level (Prisma requires it for WhereUniqueInput);
      // AND-wrapping it would throw a validation error.
      expect(out!.where).toEqual({ id: "x", AND: [{ OR: [{ tenantId: TID }, { tenantId: null }] }] });
      expect((out as Record<string, unknown>).data).toEqual({ name: "n" });
    });
  }

  it("preserves an existing AND array in the unique where", () => {
    const out = scopeQueryArgs({ operation: "update", args: { where: { id: "x", AND: [{ status: "OPEN" }] } }, tenantId: TID });
    expect(out!.where).toEqual({
      id: "x",
      AND: [{ status: "OPEN" }, { OR: [{ tenantId: TID }, { tenantId: null }] }],
    });
  });

  it("never AND-wraps the whole unique where (regression: would throw in Prisma)", () => {
    const out = scopeQueryArgs({ operation: "findUnique", args: { where: { id: "x" } }, tenantId: TID });
    // The top-level object must still expose the unique `id`.
    expect(Object.keys(out!.where as object)).toContain("id");
  });
});

describe("scopeQueryArgs — collection writes (updateMany/deleteMany)", () => {
  for (const op of ["updateMany", "deleteMany"]) {
    it(`${op}: AND-wraps the where so cross-tenant rows are out of range`, () => {
      const out = scopeQueryArgs({ operation: op, args: { where: { id: "x" } }, tenantId: TID });
      expect(out!.where).toEqual({ AND: [{ id: "x" }, { OR: [{ tenantId: TID }, { tenantId: null }] }] });
    });
  }
});

describe("scopeQueryArgs — create injects tenantId", () => {
  it("create: tags the data payload", () => {
    const out = scopeQueryArgs({ operation: "create", args: { data: { firstName: "A" } }, tenantId: TID });
    expect((out as Record<string, unknown>).data).toEqual({ firstName: "A", tenantId: TID });
  });

  it("create: does not override an explicit tenantId", () => {
    const out = scopeQueryArgs({ operation: "create", args: { data: { firstName: "A", tenantId: "other" } }, tenantId: TID });
    expect((out as Record<string, unknown>).data).toEqual({ firstName: "A", tenantId: "other" });
  });

  it("createMany: tags every row missing a tenantId", () => {
    const out = scopeQueryArgs({
      operation: "createMany",
      args: { data: [{ firstName: "A" }, { firstName: "B", tenantId: "keep" }] },
      tenantId: TID,
    });
    expect((out as Record<string, unknown>).data).toEqual([
      { firstName: "A", tenantId: TID },
      { firstName: "B", tenantId: "keep" },
    ]);
  });
});

describe("scopeQueryArgs — upsert scopes where AND tags create", () => {
  it("merges the unique where and injects tenantId into create", () => {
    const out = scopeQueryArgs({
      operation: "upsert",
      args: { where: { id: "x" }, create: { firstName: "A" }, update: { firstName: "B" } },
      tenantId: TID,
    });
    expect(out!.where).toEqual({ id: "x", AND: [{ OR: [{ tenantId: TID }, { tenantId: null }] }] });
    expect((out as Record<string, unknown>).create).toEqual({ firstName: "A", tenantId: TID });
    expect((out as Record<string, unknown>).update).toEqual({ firstName: "B" });
  });
});

describe("isTenantScopedOperation", () => {
  it("scopes reads, writes, and mutations for a tenant model", () => {
    for (const op of [
      "findUnique", "findFirst", "findMany", "count", "aggregate", "groupBy",
      "create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert",
    ]) {
      expect(isTenantScopedOperation("Patient", op)).toBe(true);
    }
  });

  it("does not scope models outside the set", () => {
    expect(isTenantScopedOperation("Tenant", "findMany")).toBe(false);
    expect(isTenantScopedOperation("TenantHostname", "findUnique")).toBe(false);
    expect(isTenantScopedOperation(undefined, "findMany")).toBe(false);
  });

  it("ignores raw/connection ops", () => {
    expect(isTenantScopedOperation("Patient", "$queryRaw")).toBe(false);
    expect(isTenantScopedOperation("Patient", "executeRaw")).toBe(false);
  });
});

/**
 * Drift guard: every model in the schema that carries a `tenantId` column
 * MUST be enforced by the extension — otherwise it silently leaks across
 * tenants (the exact bug this fix closed). The only sanctioned exception is
 * the platform-level TenantHostname mapping.
 */
describe("TENANT_SCOPED_MODELS matches the schema", () => {
  const EXCLUDED = new Set(["TenantHostname"]);

  it("covers every tenantId-bearing model", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const modelBlocks = [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)];
    const withTenantId = modelBlocks
      .filter(([, , body]) => /^\s*tenantId\b/m.test(body))
      .map(([, name]) => name);

    const missing = withTenantId.filter(
      (m) => !TENANT_SCOPED_MODELS.has(m) && !EXCLUDED.has(m),
    );
    expect(missing, `models with tenantId not enforced: ${missing.join(", ")}`).toEqual([]);
  });

  it("does not list models that lack a tenantId column", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const modelBlocks = [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)];
    const hasTenantId = new Map(
      modelBlocks.map(([, name, body]) => [name, /^\s*tenantId\b/m.test(body)]),
    );
    const bogus = [...TENANT_SCOPED_MODELS].filter((m) => hasTenantId.get(m) === false);
    expect(bogus, `listed models without a tenantId column: ${bogus.join(", ")}`).toEqual([]);
  });
});
