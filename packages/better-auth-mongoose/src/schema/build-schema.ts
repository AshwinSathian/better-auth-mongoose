import { Schema } from "mongoose";
import type { SchemaDefinition } from "mongoose";
import type { DBFieldAttribute } from "@better-auth/core/db";

export const TYPE_MAP = {
  string: String,
  number: Number,
  boolean: Boolean,
  date: Date,
} as const;

export function buildSchemaDefinition(fields: Record<string, DBFieldAttribute>): SchemaDefinition {
  const definition: SchemaDefinition = {};

  for (const [key, attr] of Object.entries(fields)) {
    // The Mongoose schema path must be the *database* field name
    // (attr.fieldName), not the logical key — Better Auth's own core
    // renames data keys to fieldName via getFieldName before this adapter
    // ever sees them, so a schema built from the logical key alone would
    // silently drop every value once a consumer customizes a field's
    // database name (e.g. `email` stored as `email_address`).
    const pathName = attr.fieldName ?? key;

    // Only a reference to another model's *id* is stored as a real
    // ObjectId ref — that's what makes .populate() work, and it's how
    // every Better Auth core relation (session.userId, account.userId,
    // etc.) is shaped. A reference to some other field (a test-suite edge
    // case, and a legitimate one — join keys aren't always the primary
    // key) has no such meaning for us: it just holds a value of its own
    // declared type, so it falls through to the generic mapping below
    // rather than being force-cast to ObjectId.
    if (attr.references && attr.references.field === "id") {
      definition[pathName] = {
        type: Schema.Types.ObjectId,
        ref: attr.references.model,
        required: attr.required ?? true,
      };
      continue;
    }

    const type = TYPE_MAP[attr.type as keyof typeof TYPE_MAP] ?? String;

    definition[pathName] = {
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
