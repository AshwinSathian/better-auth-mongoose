import { Schema } from "mongoose";
import type { DBFieldAttribute } from "@better-auth/core/db";
import { buildSchemaDefinition } from "./build-schema";

export function mergeSchema(
  requiredFields: Record<string, DBFieldAttribute>,
  consumerSchema?: Schema,
): Schema {
  const requiredDefinition = buildSchemaDefinition(requiredFields);
  const base = consumerSchema ? consumerSchema.clone() : new Schema({});

  for (const [key, pathDefinition] of Object.entries(requiredDefinition)) {
    // Required Better-Auth fields always win: add if missing, and re-assert
    // the definition if the consumer redefined it more loosely.
    base.add({ [key]: pathDefinition });
  }

  return base;
}
