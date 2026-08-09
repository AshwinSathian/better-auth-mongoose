import type { Connection } from "mongoose";
import type { BetterAuthDBSchema } from "@better-auth/core/db";
import { mergeSchema } from "./merge-schema";
import { DEFAULT_SCHEMA_OPTIONS } from "./default-schemas";
import type { AnyModel, MongooseAdapterOptions } from "../types";

export function registerModels(
  connection: Connection,
  dbSchema: BetterAuthDBSchema,
  options: MongooseAdapterOptions,
): Map<string, AnyModel> {
  const models = new Map<string, AnyModel>();
  const adoptExisting = options.adoptExistingModels ?? true;

  for (const entry of Object.values(dbSchema)) {
    const modelName = entry.modelName;
    const consumerSchema = options.schemas?.[modelName];

    const existing = adoptExisting ? connection.models[modelName] : undefined;

    if (existing) {
      const merged = mergeSchema(entry.fields, existing.schema);
      merged.set("versionKey", DEFAULT_SCHEMA_OPTIONS.versionKey);
      merged.set("minimize", DEFAULT_SCHEMA_OPTIONS.minimize);
      // Mongoose doesn't allow redefining a compiled model's schema in place,
      // so we deleteModel + re-register with the merged (backfilled) schema.
      connection.deleteModel(modelName);
      models.set(modelName, connection.model(modelName, merged));
      continue;
    }

    const schema = mergeSchema(entry.fields, consumerSchema);
    schema.set("versionKey", DEFAULT_SCHEMA_OPTIONS.versionKey);
    schema.set("minimize", DEFAULT_SCHEMA_OPTIONS.minimize);
    models.set(modelName, connection.model(modelName, schema));
  }

  return models;
}
