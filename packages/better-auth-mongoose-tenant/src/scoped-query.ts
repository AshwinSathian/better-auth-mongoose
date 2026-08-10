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
 * object, the full mutation surface, not just reads, since a "scoped" model
 * that still let `deleteMany`/`updateMany` run unscoped would leak exactly
 * the cross-tenant blast radius this package exists to prevent. `findById`,
 * `findByIdAndUpdate`, and `findByIdAndDelete` get their own wrappers below
 * that delegate to the now-scoped find-family methods, converting the id
 * into `{ _id: id }` the same way Mongoose does internally.
 * `findOneAndReplace` also needs its own wrapper: scoping only its filter
 * would leave the *replacement* document free to set (or omit) the tenant
 * field itself.
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

// Marks a model once applyTenantScope() has wrapped it, so a second call on
// the same model (hot reload, multiple betterAuth() instances in a test
// file) is a no-op instead of silently stacking another layer of wrapping.
const TENANT_SCOPED_MARKER = Symbol("better-auth-mongoose-tenant:scoped");

export function applyTenantScope(
  model: AnyModel,
  tenantField: string,
  getActiveTenantId: () => string | undefined,
): void {
  if ((model as unknown as Record<symbol, boolean>)[TENANT_SCOPED_MARKER]) {
    return;
  }

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

  // Model.findById is implemented by Mongoose itself as `this.findOne({ _id:
  // id })`, resolved dynamically on whatever `this` is at the call site.
  // Because of that, it already picks up the reassigned findOne from the
  // loop above without any wrapping here, at least as checked against
  // mongoose 9. That's an accident of how Mongoose wires its own methods
  // together, not a documented contract of theirs, so it's not something
  // this package should depend on holding across the whole 6-9 peer range.
  // These three are wrapped explicitly instead, delegating to the now-scoped
  // find-family methods, so the guarantee stands on its own.
  mutableModel.findById = (id?: unknown, ...rest: unknown[]) =>
    mutableModel.findOne!({ _id: id }, ...rest);
  mutableModel.findByIdAndUpdate = (id?: unknown, update?: unknown, ...rest: unknown[]) =>
    mutableModel.findOneAndUpdate!({ _id: id }, update, ...rest);
  mutableModel.findByIdAndDelete = (id?: unknown, ...rest: unknown[]) =>
    mutableModel.findOneAndDelete!({ _id: id }, ...rest);

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

  Object.defineProperty(model, TENANT_SCOPED_MARKER, {
    value: true,
    enumerable: false,
    configurable: false,
  });
}
