import { describe, expect, it } from "vitest";
import { tenantScoped } from "../src/plugin";

describe("tenantScoped", () => {
  it("returns a BetterAuthPlugin with a stable id", () => {
    const plugin = tenantScoped({
      scopedModels: ["Project"],
      getActiveTenantId: () => "tenant-a",
    });

    expect(plugin.id).toBe("mongoose-tenant-scoped");
  });

  it("throws a clear error from init() when a scoped model isn't registered yet", async () => {
    const plugin = tenantScoped({
      scopedModels: ["DoesNotExistModel"],
      getActiveTenantId: () => "tenant-a",
    });

    await expect(plugin.init?.({} as any)).rejects.toThrow(/DoesNotExistModel/);
  });
});
