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
 *
 * Covers every Model method whose first argument is a plain filter/conditions
 * object — the full mutation surface, not just reads, since a "scoped" model
 * that still let `deleteMany`/`updateMany` run unscoped would leak exactly
 * the cross-tenant blast radius this package exists to prevent. `findById`
 * and its variants are deliberately excluded: an id already identifies at
 * most one document, so there's no filter shape here to merge a tenant
 * clause into. `findOneAndReplace` is also excluded from this generic list —
 * it needs its own wrapper below, since scoping only its filter would leave
 * the *replacement* document free to set (or omit) the tenant field itself.
 */
const SCOPED_METHODS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "countDocuments",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
] as const satisfies readonly (keyof AnyModel)[];

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

  // Every wrapped method is individually generic and heavily overloaded,
  // which a plain reassigned function can't bind to by name — this cast to
  // a mutable, loosely-typed view of the model is TypeScript's known
  // limitation implementing generic call signatures structurally, not a
  // real type hole.
  const mutableModel = model as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const method of SCOPED_METHODS) {
    const original = mutableModel[method]!.bind(model);
    mutableModel[method] = (filter?: unknown, ...rest: unknown[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      original(scoped(filter as any), ...rest);
  }

  // A full-document replace bypasses `scoped()`'s filter merge entirely for
  // its result — without this, a replacement doc could omit the tenant
  // field (orphaning the row) or set a different one (moving it to another
  // tenant) while still passing the scoped *filter* used to find it. The
  // tenant field is force-set on the replacement the same way save() forces
  // it on a new document, so it always wins over whatever the caller passed.
  const originalFindOneAndReplace = mutableModel.findOneAndReplace!.bind(model);
  mutableModel.findOneAndReplace = (filter?: unknown, replacement?: unknown, ...rest: unknown[]) =>
    originalFindOneAndReplace(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scoped(filter as any),
      {
        ...((replacement as Record<string, unknown> | undefined) ?? {}),
        [tenantField]: requireTenantId(),
      },
      ...rest,
    );

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
