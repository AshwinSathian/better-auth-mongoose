import type { QueryFilter } from "mongoose";
import type { AnyModel } from "./types";
import {
  markTenantScoped,
  getTenantScopeConfig,
  requireTenantId as requireTenantIdFor,
} from "./tenant-marker";
import { installExecEnforcement } from "./exec-scope";

/**
 * Scopes every query and save on an already-compiled Model to the active
 * tenant. Deliberately does not use Schema.pre() hooks: this is meant to run
 * against models that are already registered elsewhere (the consumer's own
 * app code, or better-auth-mongoose's own registerModels), by the time a
 * Better Auth plugin's init() hook can reach them. Mongoose bakes
 * document-level middleware (like `save`) into the compiled Model at
 * registration time, so hooks added afterward via `model.schema.pre(...)`
 * are silently never called. Wrapping the Model's own methods works
 * regardless of when the model was compiled.
 *
 * This is one of two independent enforcement layers, not the only one.
 * Wrapping static methods here catches the common case and throws
 * immediately, synchronously, on a missing active tenant, before a Query is
 * even constructed. It cannot catch every path on its own: `Model.where()`
 * builds a fresh Query directly rather than delegating to any wrapped
 * static, and chaining `.where()`/`.equals()` after an already-scoped call
 * can overwrite the filter this layer injected before the query actually
 * executes. exec-scope.ts's Query.prototype.exec patch is the layer that
 * closes those, by enforcing the tenant field at the last possible moment
 * for every query built against a scoped model, however it was built. Both
 * layers run for anything wrapped here, redundant for those, but the
 * exec-time layer is what makes `replaceOne` (not wrapped below at all) and
 * `.where()`-based chains safe too.
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

export function applyTenantScope(
  model: AnyModel,
  tenantField: string,
  getActiveTenantId: () => string | undefined,
): void {
  if (getTenantScopeConfig(model)) {
    return;
  }
  const config = { tenantField, getActiveTenantId };
  const requireTenantId = () => requireTenantIdFor(config, model.modelName);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function scoped(filter?: QueryFilter<any>): QueryFilter<any> {
    return { ...(filter ?? {}), [tenantField]: requireTenantId() };
  }

  // Every wrapped method is individually generic and heavily overloaded,
  // which a plain reassigned function can't bind to by name. This cast to
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
  // its result. Without this, a replacement doc could omit the tenant
  // field (orphaning the row) or set a different one (moving it to another
  // tenant) while still passing the scoped *filter* used to find it. The
  // tenant field is force-set on the replacement the same way save() forces
  // it on a new document, so it always wins over whatever the caller passed.
  // (Model.replaceOne, the standalone static, isn't wrapped here at all.
  // exec-scope.ts's Query.prototype.exec patch covers it, since replaceOne
  // never delegates to any static wrapped above the same way findById does.)
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyDoc = Record<string, any>;
  function stampIfNew(doc: AnyDoc): void {
    if (doc.isNew && doc.get(tenantField) == null) {
      doc.set(tenantField, requireTenantId());
    }
  }

  const originalSave = model.prototype.save;
  model.prototype.save = function (this: AnyDoc, ...args: unknown[]) {
    stampIfNew(this);
    return originalSave.apply(this, args as never);
  };

  // Model.create() and Model.insertOne() call doc.$save(), not doc.save().
  // $save is a separate property, aliased to the *original* unwrapped save
  // at Mongoose's own module-load time (`Model.prototype.$save =
  // Model.prototype.save` in mongoose's own lib/model.js), captured before
  // any consumer code, including this wrap, ever runs. Reassigning `.save`
  // alone leaves `.$save` pointing at the pre-wrap original, so create()
  // and insertOne() would silently skip tenant stamping entirely without
  // this second wrap. Same stamping rule, a second entry point into it.
  // Guarded on existence: confirmed present against mongoose 9, but this
  // package's peer range goes back to ^6.0.0 and isn't tested against
  // older majors. If a future/older Mongoose doesn't have $save, skipping
  // it here is safe as long as create()/insertOne() call .save() directly
  // on that version instead, which stays wrapped either way.
  if (typeof model.prototype.$save === "function") {
    const original$save = model.prototype.$save;
    model.prototype.$save = function (this: AnyDoc, ...args: unknown[]) {
      stampIfNew(this);
      return original$save.apply(this, args as never);
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function stampEntry(entry: any): unknown {
    if (entry instanceof model) {
      stampIfNew(entry);
      return entry;
    }
    if (entry && typeof entry === "object" && entry[tenantField] == null) {
      return { ...entry, [tenantField]: requireTenantId() };
    }
    return entry;
  }

  // insertMany() builds documents through its own internal validation
  // pipeline and never calls save() or $save() at all. A completely
  // separate document-creation path that needs its own stamping, applied
  // before Mongoose's own validation runs. Accepts a single doc or an
  // array, plain objects or already-constructed Document instances, same
  // as Mongoose's own insertMany does.
  const originalInsertMany = mutableModel.insertMany!.bind(model);
  mutableModel.insertMany = (arg?: unknown, ...rest: unknown[]) =>
    originalInsertMany(
      Array.isArray(arg) ? arg.map((entry) => stampEntry(entry)) : stampEntry(arg),
      ...rest,
    );

  // bulkSave() takes already-constructed Document instances the caller
  // built beforehand (outside save()/$save()/insertMany(), so none of the
  // above reaches them) and turns them into bulkWrite ops directly. Same
  // stamping rule, applied to each document in place before delegating.
  // Guarded on existence: bulkSave() is a newer addition to Mongoose's
  // static surface and may not exist on older majors in the ^6.0.0 peer
  // range this package targets but doesn't test against directly.
  if (typeof mutableModel.bulkSave === "function") {
    const originalBulkSave = mutableModel.bulkSave.bind(model);
    mutableModel.bulkSave = (documents?: unknown, ...rest: unknown[]) => {
      for (const doc of (documents as unknown[] | undefined) ?? []) {
        stampEntry(doc);
      }
      return originalBulkSave(documents, ...rest);
    };
  }

  markTenantScoped(model, config);
  installExecEnforcement();
}
