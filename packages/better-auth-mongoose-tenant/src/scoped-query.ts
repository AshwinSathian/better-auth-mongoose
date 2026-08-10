import type { QueryFilter } from "mongoose";
import type { AnyModel } from "./types";

/**
 * Scopes every query and save on an already-compiled Model to the active
 * tenant. Deliberately does not use Schema.pre() hooks: this is meant to run
 * against models that are already registered elsewhere (the consumer's own
 * app code, or better-auth-mongoose's own registerModels), by the time a
 * Better Auth plugin's init() hook can reach them — and Mongoose bakes
 * document-level middleware (like `save`) into the compiled Model at
 * registration time, so hooks added afterward via `model.schema.pre(...)`
 * are silently never called. Wrapping the Model's own methods works
 * regardless of when the model was compiled.
 */
export function applyTenantScope(
  model: AnyModel,
  tenantField: string,
  getActiveTenantId: () => string | undefined,
): void {
  function requireTenantId(): string {
    const id = getActiveTenantId();
    if (!id) {
      throw new Error(
        `better-auth-mongoose-tenant: no active tenant id available for a query against "${model.modelName}". ` +
          `Refusing to run an unscoped query rather than silently leaking cross-tenant data.`,
      );
    }
    return id;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function scoped(filter?: QueryFilter<any>): QueryFilter<any> {
    return { ...(filter ?? {}), [tenantField]: requireTenantId() };
  }

  // Model's find/findOne/etc. are individually generic and heavily
  // overloaded, which a plain reassigned function can't bind to by name —
  // these casts are TypeScript's known limitation implementing generic call
  // signatures structurally, not a real type hole.
  const originalFind = model.find.bind(model);
  model.find = ((filter?: unknown, ...rest: unknown[]) =>
    (originalFind as (...args: unknown[]) => unknown)(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scoped(filter as any),
      ...rest,
    )) as typeof model.find;

  const originalFindOne = model.findOne.bind(model);
  model.findOne = ((filter?: unknown, ...rest: unknown[]) =>
    (originalFindOne as (...args: unknown[]) => unknown)(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scoped(filter as any),
      ...rest,
    )) as typeof model.findOne;

  const originalFindOneAndUpdate = model.findOneAndUpdate.bind(model);
  model.findOneAndUpdate = ((filter?: unknown, ...rest: unknown[]) =>
    (originalFindOneAndUpdate as (...args: unknown[]) => unknown)(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scoped(filter as any),
      ...rest,
    )) as typeof model.findOneAndUpdate;

  const originalCountDocuments = model.countDocuments.bind(model);
  model.countDocuments = ((filter?: unknown, ...rest: unknown[]) =>
    (originalCountDocuments as (...args: unknown[]) => unknown)(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scoped(filter as any),
      ...rest,
    )) as typeof model.countDocuments;

  const originalSave = model.prototype.save;
  model.prototype.save = function (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this: any,
    ...args: unknown[]
  ) {
    if (this.isNew && this.get(tenantField) == null) {
      this.set(tenantField, requireTenantId());
    }
    return originalSave.apply(this, args as never);
  };
}
