import type { Connection } from "mongoose";
import type { BetterAuthDBSchema, DBFieldAttribute } from "@better-auth/core/db";
import { mergeSchema } from "./merge-schema";
import { DEFAULT_SCHEMA_OPTIONS } from "./default-schemas";
import type { AnyModel, MongooseAdapterOptions } from "../types";

interface ModelsCacheEntry {
  models: Map<string, AnyModel>;
  // Tracks the field set each cached model was last built from, so a later
  // registerModels() call for the same connection can tell "this model's
  // schema hasn't changed, reuse the live instance" (avoids both wasted work
  // and churning a Model instance out from under an in-flight operation,
  // e.g. a transaction in progress) apart from "this model's shape actually
  // changed" (a field was added/removed, renamed via fieldName, or had its
  // required/unique/reference changed — e.g. betterAuthOptions evolving
  // between calls), which does need a real rebuild.
  fieldSignatures: Map<string, string>;
  // Readiness (collection exists, indexes match the current schema) tracked
  // per model and only re-derived for models that were actually rebuilt —
  // not the whole set on every call, which would defeat the point of the
  // signature check above by round-tripping every model every time anyway.
  readyPromises: Map<string, Promise<void>>;
}

const modelsCache = new WeakMap<Connection, ModelsCacheEntry>();

function fieldSignature(fields: Record<string, DBFieldAttribute>): string {
  // Both the logical key and fieldName matter: a field can keep its name
  // but change shape (required, unique, index, fieldName, reference target)
  // between migrations, and any of those must still trigger a rebuild —
  // `index` in particular must stay in lockstep with `unique` here, since
  // dropping only *this* flag without a rebuild would leave a stale index
  // on the real collection that the current schema no longer declares.
  return Object.keys(fields)
    .sort()
    .map((name) => {
      const attr = fields[name]!;
      return `${name}:${attr.fieldName ?? name}:${attr.type}:${attr.required ?? true}:${attr.unique ?? false}:${attr.index ?? false}:${attr.references?.model ?? ""}:${attr.references?.field ?? ""}`;
    })
    .join(",");
}

export function registerModels(
  connection: Connection,
  dbSchema: BetterAuthDBSchema,
  options: MongooseAdapterOptions,
): Map<string, AnyModel> {
  let cacheEntry = modelsCache.get(connection);
  if (!cacheEntry) {
    cacheEntry = { models: new Map(), fieldSignatures: new Map(), readyPromises: new Map() };
    modelsCache.set(connection, cacheEntry);
  }

  const adoptExisting = options.adoptExistingModels ?? true;

  for (const entry of Object.values(dbSchema)) {
    const modelName = entry.modelName;
    const newSignature = fieldSignature(entry.fields);

    if (cacheEntry.fieldSignatures.get(modelName) === newSignature) {
      continue;
    }

    // Only treat connection.models[modelName] as a genuine external schema
    // to adopt-and-merge-with the first time we ever see this model name.
    // If *we* registered it before (even under a different shape, tracked
    // above by fieldSignatures), replace it outright — merging with our own
    // stale registration would keep accumulating fields that are no longer
    // part of the current schema (mergeSchema only adds, never removes).
    const weOwnIt = cacheEntry.fieldSignatures.has(modelName);
    const consumerSchema = options.schemas?.[modelName];
    const existing = adoptExisting && !weOwnIt ? connection.models[modelName] : undefined;

    let model: AnyModel;
    if (existing) {
      const merged = mergeSchema(entry.fields, existing.schema);
      merged.set("versionKey", DEFAULT_SCHEMA_OPTIONS.versionKey);
      merged.set("minimize", DEFAULT_SCHEMA_OPTIONS.minimize);
      connection.deleteModel(modelName);
      model = connection.model(modelName, merged);
    } else {
      const schema = mergeSchema(entry.fields, consumerSchema);
      schema.set("versionKey", DEFAULT_SCHEMA_OPTIONS.versionKey);
      schema.set("minimize", DEFAULT_SCHEMA_OPTIONS.minimize);
      // Mongoose doesn't allow redefining a compiled model's schema in
      // place, so a real shape change still needs deleteModel + re-register
      // even when we own it (no genuinely "existing" model to adopt from).
      if (weOwnIt || connection.models[modelName]) connection.deleteModel(modelName);
      model = connection.model(modelName, schema);
    }

    cacheEntry.models.set(modelName, model);
    cacheEntry.fieldSignatures.set(modelName, newSignature);
    // syncIndexes (not just createCollection) matters here: MongoDB doesn't
    // drop a stale index just because the schema no longer declares it —
    // e.g. renaming a unique `email` field to `email_address` leaves the
    // old `email_1` unique index in place, which then rejects every future
    // document for having `email: null`. syncIndexes reconciles the actual
    // indexes with the current schema, dropping what no longer applies.
    const ready = model.syncIndexes().then(() => undefined);
    // registerModels() itself is synchronous and doesn't force callers to
    // await readiness (only the transaction path does, deliberately, before
    // starting a session) — so this must not surface as an unhandled
    // rejection if nothing ever calls getModelsReady(). Real callers still
    // observe failures through the same promise via getModelsReady().
    ready.catch(() => {});
    cacheEntry.readyPromises.set(modelName, ready);
  }

  return cacheEntry.models;
}

export function getModelsReady(
  connection: Connection,
  models: Map<string, AnyModel>,
): Promise<void> {
  const cacheEntry = modelsCache.get(connection);
  if (!cacheEntry) return Promise.resolve();

  return Promise.all(
    Array.from(models.keys()).map(
      (name) => cacheEntry.readyPromises.get(name) ?? Promise.resolve(),
    ),
  ).then(() => undefined);
}
