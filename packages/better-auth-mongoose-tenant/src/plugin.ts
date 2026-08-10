import type { BetterAuthPlugin } from "better-auth";
import mongoose from "mongoose";
import { applyTenantScope } from "./scoped-query";
import type { TenantScopedOptions } from "./types";

export function tenantScoped(options: TenantScopedOptions): BetterAuthPlugin {
  const tenantField = options.tenantField ?? "organizationId";

  return {
    id: "mongoose-tenant-scoped",
    async init() {
      for (const modelName of options.scopedModels) {
        const model = mongoose.models[modelName];
        if (!model) {
          throw new Error(
            `better-auth-mongoose-tenant: model "${modelName}" is not registered on the default ` +
              `mongoose connection yet. Register it (or pass its connection explicitly — see README) ` +
              `before calling tenantScoped().`,
          );
        }
        applyTenantScope(model, tenantField, options.getActiveTenantId);
      }
    },
  } satisfies BetterAuthPlugin;
}
