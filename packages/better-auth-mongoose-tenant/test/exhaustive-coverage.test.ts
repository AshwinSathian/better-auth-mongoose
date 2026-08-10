import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import mongoose, { Schema, type Connection } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { applyTenantScope } from "../src/scoped-query";

// Wrapped directly as a static (either in scoped-query.ts's SCOPED_METHODS
// loop, or by one of its hand-written delegating wrappers).
const WRAPPED_AS_STATIC = new Set([
  "find",
  "findOne",
  "findById",
  "findOneAndUpdate",
  "findByIdAndUpdate",
  "findOneAndDelete",
  "findByIdAndDelete",
  "findOneAndReplace",
  "countDocuments",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "insertMany",
  "bulkSave",
]);

// Not wrapped as a static at all, but correct and scoped anyway, because
// exec-scope.ts enforces the tenant field on every Query at the moment it
// executes, regardless of how that Query was built. `where`/`$where`
// construct a Query directly rather than delegating to any wrapped static
// (that's the whole bug this package's second review round found);
// `exists`/`distinct`/`replaceOne` could be wrapped too, but doing so would
// be redundant given exec-time enforcement already makes them correct.
const COVERED_BY_EXEC_ENFORCEMENT_ONLY = new Set([
  "where",
  "$where",
  "exists",
  "distinct",
  "replaceOne",
]);

// Every remaining Model static, with the reason it's neither wrapped nor
// covered by exec-time enforcement. A method landing here is a deliberate,
// reviewed decision, not an oversight. Anything Mongoose adds later that
// isn't in one of the three sets above fails the test below until it's
// triaged into one of them.
const DOCUMENTED_EXCLUSIONS: Record<string, string> = {
  // Delegates to $save() per document internally, which is wrapped.
  create: "delegates to doc.$save() per document, which is wrapped directly",
  insertOne: "delegates to doc.$save(), which is wrapped directly",
  // No filter concept. exec-scope.ts throws rather than silently
  // returning an all-tenants count.
  estimatedDocumentCount:
    "no filter to scope by; exec-scope.ts throws instead of running it unscoped",
  // Heterogeneous raw driver ops; bulkSave() (wrapped) calls this
  // internally via dynamic `this` dispatch, so a throw-guard here would
  // also break bulkSave's own delegation.
  bulkWrite:
    "heterogeneous raw ops; bulkSave() depends on calling through to the real implementation",
  // Pipeline-based, not filter-based.
  aggregate:
    "pipeline-based; scoping means prepending $match, too pipeline-specific to do generically",
  // Not a query at all.
  watch: "a change-stream subscription, not a query",
  startSession: "session infrastructure, not data access",
  useConnection: "connection-level infrastructure, not data access",
  discriminator: "schema/model registration, not data access",
  init: "index-building lifecycle, not data access",
  compile: "model-compilation internals",
  recompileSchema: "schema internals",
  clientEncryption: "encryption config, not data access",
  namespace: "metadata accessor",
  inspect: "debug/console utility",
  createCollection: "infrastructure",
  syncIndexes: "infrastructure",
  createSearchIndex: "infrastructure",
  updateSearchIndex: "infrastructure",
  dropSearchIndex: "infrastructure",
  listSearchIndexes: "infrastructure",
  diffIndexes: "infrastructure",
  cleanIndexes: "infrastructure",
  listIndexes: "infrastructure",
  ensureIndexes: "infrastructure",
  createIndexes: "infrastructure",
  createSearchIndexes: "infrastructure",
  // Pure data-transform / validation utilities: no DB round trip, so
  // nothing to scope by tenant.
  translateAliases: "pure data-transform utility, no DB interaction",
  applyDefaults: "pure data-transform utility, no DB interaction",
  applyVirtuals: "pure data-transform utility, no DB interaction",
  applyTimestamps: "pure data-transform utility, no DB interaction",
  castObject: "pure data-transform utility, no DB interaction",
  buildBulkWriteOperations: "internal helper used by bulkSave, not a public entry point",
  validate: "schema validation utility, no DB interaction",
  populate: "post-processes already-fetched data, no DB round trip of its own",
  hydrate: "converts a plain object into a document, no DB interaction",
};

function ownStaticFunctionNames(): string[] {
  const Model = mongoose.Model as any;
  // Model extends Node's EventEmitter (both at the instance level and,
  // unusually, with several emitter methods mixed directly onto the Model
  // class itself as statics: emit, addListener, on, ...). Generic
  // event-bus plumbing, not Mongoose data-access methods, so excluded by
  // diffing against EventEmitter itself (both its own statics and its
  // prototype methods) rather than hand-listing each one.
  const eventEmitterNames = new Set([
    ...Object.getOwnPropertyNames(EventEmitter),
    ...Object.getOwnPropertyNames(EventEmitter.prototype),
  ]);
  return Object.getOwnPropertyNames(Model).filter(
    (name) =>
      typeof Model[name] === "function" &&
      !eventEmitterNames.has(name) &&
      // Mongoose's own naming convention for internal/private members,
      // `_foo`, `$__foo`, `__foo`, excluded by that convention rather
      // than by name, so a new internal helper doesn't need a manual entry.
      !name.startsWith("_") &&
      !name.startsWith("$"),
  );
}

describe("exhaustive static-method coverage", () => {
  it("classifies every Mongoose Model static as wrapped, exec-covered, or an explicitly documented exclusion", () => {
    const unclassified = ownStaticFunctionNames().filter(
      (name) =>
        !WRAPPED_AS_STATIC.has(name) &&
        !COVERED_BY_EXEC_ENFORCEMENT_ONLY.has(name) &&
        !(name in DOCUMENTED_EXCLUSIONS),
    );

    // A method landing here means either this Mongoose version added
    // something new since this list was last reviewed, or the classifying
    // sets above have drifted from scoped-query.ts's actual implementation.
    // Either way, it needs a human decision, not a silent pass.
    expect(unclassified).toEqual([]);
  });

  it("wraps both save() and $save() on the prototype, not just save()", async () => {
    const mongod = await MongoMemoryServer.create();
    const connection: Connection = mongoose.createConnection(mongod.getUri());
    await connection.asPromise();

    const Item = connection.model(
      "ExhaustiveCoverageProtoItem",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Item, "organizationId", () => "tenant-a");

    expect(Object.prototype.hasOwnProperty.call(Item.prototype, "save")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(Item.prototype, "$save")).toBe(true);

    await connection.close();
    await mongod.stop();
  });
});
