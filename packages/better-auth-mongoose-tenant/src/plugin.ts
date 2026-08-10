import type { BetterAuthPlugin } from "better-auth";
import mongoose from "mongoose";
import { applyTenantScope } from "./scoped-query";
import type { TenantScopedOptions } from "./types";

export function tenantScoped(options: TenantScopedOptions): BetterAuthPlugin {
  const tenantField = options.tenantField ?? "organizationId";

  return {
    id: "mongoose-tenant-scoped",
    async init() {
      const registry = options.connection ?? mongoose;
      for (const modelName of options.scopedModels) {
        const model = registry.models[modelName];
        if (!model) {
          throw new Error(
            `better-auth-mongoose-tenant: model "${modelName}" is not registered on the ` +
              `${options.connection ? "provided" : "default"} connection yet. Register it ` +
              `before calling tenantScoped().`,
          );
        }
        applyTenantScope(model, tenantField, options.getActiveTenantId);
      }
    },
  } satisfies BetterAuthPlugin;
}
