import type { AnyModel } from "./types";

export interface TenantScopeConfig {
  tenantField: string;
  getActiveTenantId: () => string | undefined;
}

// Marks a model once applyTenantScope() has wrapped it, carrying the config
// needed by both the static-method wrapping (scoped-query.ts) and the
// exec-time enforcement (exec-scope.ts). A shared module so neither has to
// import the other. Non-enumerable so it never shows up in Object.keys(),
// JSON.stringify(), or a debugger's default object inspection.
const TENANT_SCOPED_MARKER = Symbol("better-auth-mongoose-tenant:scoped");

export function markTenantScoped(model: AnyModel, config: TenantScopeConfig): void {
  Object.defineProperty(model, TENANT_SCOPED_MARKER, {
    value: config,
    enumerable: false,
    configurable: false,
  });
}

export function getTenantScopeConfig(model: AnyModel): TenantScopeConfig | undefined {
  return (model as unknown as Record<symbol, TenantScopeConfig | undefined>)[TENANT_SCOPED_MARKER];
}

export function requireTenantId(config: TenantScopeConfig, modelName: string): string {
  const id = config.getActiveTenantId();
  if (!id) {
    throw new Error(
      `better-auth-mongoose-tenant: no active tenant id available for a query against "${modelName}". ` +
        `Refusing to run an unscoped query rather than silently leaking cross-tenant data.`,
    );
  }
  return id;
}
