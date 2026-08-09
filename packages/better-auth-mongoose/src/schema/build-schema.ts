import { Schema } from "mongoose";
import type { SchemaDefinition } from "mongoose";
import type { DBFieldAttribute } from "@better-auth/core/db";

const TYPE_MAP = {
  string: String,
  number: Number,
  boolean: Boolean,
  date: Date,
} as const;

export function buildSchemaDefinition(fields: Record<string, DBFieldAttribute>): SchemaDefinition {
  const definition: SchemaDefinition = {};

  for (const [key, attr] of Object.entries(fields)) {
    if (attr.references) {
      definition[key] = {
        type: Schema.Types.ObjectId,
        ref: attr.references.model,
        required: attr.required ?? true,
      };
      continue;
    }

    const type = TYPE_MAP[attr.type as keyof typeof TYPE_MAP] ?? String;

    definition[key] = {
      type,
      required: attr.required ?? true,
      ...(attr.unique ? { unique: true } : {}),
      ...(attr.index ? { index: true } : {}),
      ...(attr.defaultValue !== undefined && typeof attr.defaultValue !== "function"
        ? { default: attr.defaultValue }
        : {}),
      ...(typeof attr.defaultValue === "function"
        ? { default: attr.defaultValue as () => unknown }
        : {}),
    };
  }

  return definition;
}
