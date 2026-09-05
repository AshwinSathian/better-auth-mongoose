import mongoose from "mongoose";
import type { AnyModel } from "./types";
import { getTenantScopeConfig, requireTenantId, type TenantScopeConfig } from "./tenant-marker";

/**
 * Mongoose's own opToThunk map (lib/query.js) enumerates the complete,
 * closed set of operations a Query can ever execute as. This isn't a
 * method-name list this package has to independently keep in sync; it's
 * read directly off Mongoose's own internals during development. Anything
 * not in one of these three buckets is treated as unknown and refused
 * rather than silently run unscoped (the final throw in enforce()).
 *
 * "count", "findOneAndRemove", "remove", and "update" are legacy ops
 * verified empirically against real mongoose 6 and 7 installs, not from
 * memory: Model.count(), Model.findOneAndRemove()/findByIdAndRemove()
 * (which both construct a Query with op "findOneAndRemove", the same
 * delegation pattern as findByIdAndDelete on modern Mongoose), Model
 * .remove(), and Model.update() all still exist on those majors, and
 * Mongoose 9's own opToThunk (which this file otherwise mirrors) dropped
 * every one of them. Including them here is safe on 9 specifically because
 * the methods that produce them don't exist there at all, so a Query can
 * never carry these op values on that version; this is what makes the peer
 * range down to ^6.0.0 actually true rather than aspirational.
 */
const FILTER_ONLY_OPS = new Set([
  "find",
  "findOne",
  "countDocuments",
  "count",
  "distinct",
  "deleteMany",
  "deleteOne",
  "findOneAndDelete",
  "findOneAndRemove",
  "remove",
]);
const UPDATE_BODY_OPS = new Set(["updateOne", "updateMany", "findOneAndUpdate", "update"]);
const REPLACEMENT_OPS = new Set(["replaceOne", "findOneAndReplace"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = Record<string, any>;

function enforceUpdateBody(
  update: Record<string, unknown>,
  tenantField: string,
  tenantId: string,
): void {
  if (update.$set && typeof update.$set === "object") {
    (update.$set as Record<string, unknown>)[tenantField] = tenantId;
  } else {
    // No `$set` present (e.g. an implicit-set plain update body), so set it
    // directly on the top-level update object, the same shape Mongoose
    // itself accepts for a non-atomic update.
    update[tenantField] = tenantId;
  }
  // An update can also try to remove or relocate the tenant field instead
  // of overwriting it outright, so strip both rather than only guarding $set.
  if (update.$unset && typeof update.$unset === "object") {
    delete (update.$unset as Record<string, unknown>)[tenantField];
  }
  if (update.$rename && typeof update.$rename === "object") {
    delete (update.$rename as Record<string, unknown>)[tenantField];
  }
}

function enforce(query: AnyQuery, config: TenantScopeConfig, op: string | undefined): void {
  const { tenantField } = config;
  const modelName = (query.model as AnyModel | undefined)?.modelName ?? "unknown model";

  if (op === "estimatedDocumentCount") {
    throw new Error(
      `better-auth-mongoose-tenant: estimatedDocumentCount() has no filter to scope by tenant on ` +
        `"${modelName}" and would silently count every tenant's documents. Use countDocuments({}) ` +
        `instead, which is scoped.`,
    );
  }

  if (
    op != null &&
    (FILTER_ONLY_OPS.has(op) || UPDATE_BODY_OPS.has(op) || REPLACEMENT_OPS.has(op))
  ) {
    const tenantId = requireTenantId(config, modelName);
    // getFilter() returns the query's live _conditions reference (confirmed
    // against mongoose 9's own source), so mutating it here mutates the
    // query itself. No setQuery()/re-assembly needed.
    (query.getFilter() as Record<string, unknown>)[tenantField] = tenantId;

    if (UPDATE_BODY_OPS.has(op)) {
      // getUpdate() can return null/undefined for a query with no update
      // body at all. Falling back to a fresh object and explicitly
      // setUpdate()-ing it back afterward (rather than only mutating
      // whatever getUpdate() happened to return) guarantees the enforced
      // object is actually attached to the query either way.
      const update = (query.getUpdate() as Record<string, unknown> | null | undefined) ?? {};
      enforceUpdateBody(update, tenantField, tenantId);
      query.setUpdate(update);
    } else if (REPLACEMENT_OPS.has(op)) {
      const replacement = (query.getUpdate() as Record<string, unknown> | null | undefined) ?? {};
      replacement[tenantField] = tenantId;
      query.setUpdate(replacement);
    }
    return;
  }

  // Every real op Mongoose can execute a Query as is accounted for above.
  // Reaching here means either a Mongoose version this package hasn't seen
  // (the internal op set changed) or something constructing a Query in a
  // way this package doesn't recognize. Refuse rather than guess.
  throw new Error(
    `better-auth-mongoose-tenant: don't know how to safely scope a "${op}" query against "${modelName}". ` +
      `Refusing to run it unscoped rather than silently leaking cross-tenant data. This usually means ` +
      `a Mongoose version mismatch; please file an issue.`,
  );
}

let installed = false;

/**
 * Patches Query.prototype.exec exactly once, module-wide, not per model.
 * This is what actually closes the gap the static-method wrapping in
 * scoped-query.ts can't: Model.where() builds a Query directly rather than
 * delegating to any wrapped static, and chaining .where()/.equals() after
 * an already-scoped call can overwrite the filter before it executes.
 * Query.prototype.then is `return this.exec().then(...)`, so this single
 * choke point covers `await query`, `.then()`, and explicit `.exec()`
 * alike, for every query built against a tenant-scoped model, regardless
 * of how it was constructed.
 *
 * Every other model in the process is entirely unaffected: the check below
 * is a no-op unless the query's own model carries a tenant-scope marker.
 */
export function installExecEnforcement(): void {
  if (installed) return;
  installed = true;

  const QueryProto = mongoose.Query.prototype as AnyQuery;
  const originalExec = QueryProto.exec;
  // Must stay async: Query.prototype.exec is documented to always return a
  // Promise, and callers reasonably rely on that. Query.prototype.then is
  // `this.exec().then(...)`, so a synchronous throw here, from a plain
  // function throwing before ever returning a promise, would surface as a
  // synchronous exception on `await query` instead of a normal rejection.
  QueryProto.exec = async function (this: AnyQuery, ...args: unknown[]) {
    const config = getTenantScopeConfig(this.model as AnyModel);
    if (config) {
      // exec(op) accepts an optional op string that overrides this.op,
      // mirroring the same check the original exec() does internally, so
      // enforcement classifies by the op that's actually about to run
      // rather than a possibly-stale one from construction time.
      const op =
        typeof args[0] === "string" ? (args[0] as string) : (this.op as string | undefined);
      enforce(this, config, op);
    }
    return originalExec.apply(this, args);
  };

  // Query.prototype.cursor() (and `for await (const doc of query)`, whose
  // Symbol.asyncIterator implementation is `return this.cursor()`) never
  // calls Query.prototype.exec() at all: QueryCursor reads the query's raw
  // `_conditions` directly against `model.collection.find(...)`, bypassing
  // the driver-level round trip exec() normally makes. Without this second
  // patch, `Model.find({}).where(tenantField).equals(otherTenantId).cursor()`
  // streamed another tenant's documents in full, silently — the exact
  // .where()-after-scoping bypass the exec() patch above exists to close,
  // just through a different Mongoose entry point that never reaches it.
  const originalCursor = QueryProto.cursor;
  QueryProto.cursor = function (this: AnyQuery, ...args: unknown[]) {
    const config = getTenantScopeConfig(this.model as AnyModel);
    if (config) {
      try {
        enforce(this, config, this.op as string | undefined);
      } catch (err) {
        // Mirrors Mongoose's own convention here: a cast error inside the
        // real cursor() is never thrown synchronously either, it's attached
        // to the returned QueryCursor via _markError() so it surfaces
        // through the stream/async-iterator's normal error path instead.
        // cursor() has no Promise to reject, so a synchronous throw here
        // would break every caller relying on always getting a cursor
        // object back, unlike a rejected `await`. This is safe even though
        // the cursor below still gets constructed against whatever filter
        // enforcement rejected: QueryCursor's own consumption path checks
        // `_error` before ever advancing the underlying raw driver cursor
        // (confirmed against mongoose 9's own source), the same way
        // Mongoose's own cast-error branch relies on, so no document is
        // ever actually pulled once _markError has been called.
        return originalCursor.apply(this, args)._markError(err);
      }
    }
    return originalCursor.apply(this, args);
  };
}
