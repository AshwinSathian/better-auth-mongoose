import { Types } from "mongoose";
import type { DBFieldAttribute, BetterAuthDBSchema } from "@better-auth/core/db";
import type { BetterAuthOptions } from "better-auth";

type TransformAction =
  | "create"
  | "update"
  | "findOne"
  | "findMany"
  | "updateMany"
  | "delete"
  | "deleteMany"
  | "consumeOne"
  | "incrementOne"
  | "count";

interface CustomTransformInputProps {
  data: unknown;
  fieldAttributes: DBFieldAttribute;
  field: string;
  action: TransformAction;
  model: string;
  schema: BetterAuthDBSchema;
  options: BetterAuthOptions;
}

interface CustomTransformOutputProps {
  data: unknown;
  fieldAttributes: DBFieldAttribute;
  field: string;
  select: string[];
  model: string;
  schema: BetterAuthDBSchema;
  options: BetterAuthOptions;
}

/**
 * Better Auth's default ID generator produces a 32-character base62 string,
 * not a valid ObjectId. This generator makes every id this adapter creates a
 * real 24-character ObjectId hex string, which is what makes Mongoose
 * .populate() work against consumer-defined `{ type: ObjectId, ref: ... }`
 * fields. Mirrors @better-auth/mongo-adapter's own customIdGenerator, using
 * mongoose's re-exported Types.ObjectId instead of a direct `mongodb` import.
 */
export function generateObjectIdString(): string {
  return new Types.ObjectId().toHexString();
}

export function customIdGenerator(_props: { model: string }): string {
  return generateObjectIdString();
}

function hasUserProvidedGenerateId(options: BetterAuthOptions): boolean {
  return typeof options.advanced?.database?.generateId === "function";
}

/**
 * Best-effort string -> ObjectId coercion, falling back to the original
 * value on failure. Exported for reuse by where-clause filtering
 * (operations/read.ts), which needs the same tolerant coercion for query
 * values against ObjectId-typed paths.
 */
export function coerceToObjectId(value: unknown): unknown {
  if (value instanceof Types.ObjectId) return value;
  if (Array.isArray(value)) return value.map((v) => coerceToObjectId(v));
  if (typeof value === "string") {
    try {
      return new Types.ObjectId(value);
    } catch {
      return value;
    }
  }
  return value;
}

function isIdField(field: string, fieldAttributes: DBFieldAttribute): boolean {
  return field === "_id" || fieldAttributes.references?.field === "id";
}

/**
 * Converts string ids to real ObjectId instances before they reach Mongoose,
 * for `_id` itself and any field referencing another model's `id`. Falls
 * back to the original string if it isn't valid ObjectId hex — this only
 * matters if a consumer overrides `advanced.database.generateId` with
 * something that doesn't return ObjectId-compatible strings.
 */
export function makeCustomTransformInput() {
  return ({
    action,
    data,
    field,
    fieldAttributes,
    options,
  }: CustomTransformInputProps): unknown => {
    if (!isIdField(field, fieldAttributes)) return data;

    if (hasUserProvidedGenerateId(options)) return data;

    if (action !== "create" && action !== "update") return data;

    if (fieldAttributes.references?.field === "id" && !fieldAttributes.required && data === null) {
      return null;
    }

    return coerceToObjectId(data);
  };
}

/**
 * Converts ObjectId instances back to hex strings on the way out, for `id`
 * and any field referencing another model's `id`.
 */
export function makeCustomTransformOutput() {
  return ({ data, field, fieldAttributes }: CustomTransformOutputProps): unknown => {
    if (field !== "id" && fieldAttributes.references?.field !== "id") return data;

    if (data instanceof Types.ObjectId) return data.toHexString();
    if (Array.isArray(data)) {
      return data.map((v) => (v instanceof Types.ObjectId ? v.toHexString() : v));
    }
    return data;
  };
}
