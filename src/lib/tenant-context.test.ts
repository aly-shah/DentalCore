import { describe, expect, it } from "vitest";
import {
  bypassTenantScope,
  getCurrentTenantId,
  isTenantScopeBypassed,
  runWithTenant,
  setCurrentTenant,
} from "./tenant-context";

describe("tenant-context", () => {
  it("returns null when no context is set", async () => {
    // runWithTenant isolates the test so we don't pollute the suite
    await runWithTenant(null, async () => {
      expect(getCurrentTenantId()).toBeNull();
      expect(isTenantScopeBypassed()).toBe(false);
    });
  });

  it("setCurrentTenant binds for the rest of the async context", async () => {
    await runWithTenant(null, async () => {
      setCurrentTenant("tenant-a");
      expect(getCurrentTenantId()).toBe("tenant-a");

      // Nested await still sees the value
      await Promise.resolve();
      expect(getCurrentTenantId()).toBe("tenant-a");
    });
  });

  it("runWithTenant scopes the callback", async () => {
    await runWithTenant("tenant-outer", async () => {
      expect(getCurrentTenantId()).toBe("tenant-outer");

      await runWithTenant("tenant-inner", async () => {
        expect(getCurrentTenantId()).toBe("tenant-inner");
      });

      // Returns to outer scope
      expect(getCurrentTenantId()).toBe("tenant-outer");
    });
  });

  it("bypassTenantScope marks the context", async () => {
    await runWithTenant("tenant-a", async () => {
      expect(isTenantScopeBypassed()).toBe(false);

      await bypassTenantScope(async () => {
        expect(isTenantScopeBypassed()).toBe(true);
        // Bypass also clears tenantId so admin/cron lookups don't get filtered.
        expect(getCurrentTenantId()).toBeNull();
      });

      // Restored after callback
      expect(isTenantScopeBypassed()).toBe(false);
      expect(getCurrentTenantId()).toBe("tenant-a");
    });
  });

  it("parallel runWithTenant callbacks don't leak between each other", async () => {
    const results: Record<string, string | null> = {};
    await Promise.all([
      runWithTenant("t-1", async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.t1 = getCurrentTenantId();
      }),
      runWithTenant("t-2", async () => {
        results.t2 = getCurrentTenantId();
      }),
      runWithTenant("t-3", async () => {
        await new Promise((r) => setTimeout(r, 5));
        results.t3 = getCurrentTenantId();
      }),
    ]);
    expect(results.t1).toBe("t-1");
    expect(results.t2).toBe("t-2");
    expect(results.t3).toBe("t-3");
  });
});
