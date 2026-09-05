import { Types, type ClientSession } from "mongoose";
import type { CustomAdapter, CleanedWhere } from "@better-auth/core/db/adapter";
import { coerceToObjectId } from "../id-mapping";
import { applyJoin } from "../join";
import type { AnyModel } from "../types";

export type GetFieldName = (props: { model: string; field: string }) => string;

const OPERATOR_MAP: Record<string, string> = {
  eq: "$eq",
  ne: "$ne",
  gt: "$gt",
  gte: "$gte",
  lt: "$lt",
  lte: "$lte",
  in: "$in",
  not_in: "$nin",
};

/**
 * Escapes regex special characters for safe use inside a MongoDB $regex,
 * so a `contains`/`starts_with`/`ends_with` where-clause value can never be
 * interpreted as regex syntax (e.g. by an end user's search input).
 */
function escapeForMongoRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Marks a where-clause value that could not be coerced to a valid ObjectId
 * against an ObjectId-typed path. Mongoose casts query filter values against
 * the schema itself at execution time — independently of, and *after*,
 * whatever coerceToObjectId already tried — and that cast is strict (throws
 * CastError, doesn't fall back). So an invalid id (e.g. a caller checking
 * "does this malformed id exist?") must never reach the query as a raw
 * string on an ObjectId path; it's translated into a filter that
 * deterministically matches (eq/in) or excludes (ne/not_in) nothing instead.
 */
const UNCOERCIBLE = Symbol("uncoercible-objectid");

function coerceWhereValue(mongooseModel: AnyModel, field: string, value: unknown): unknown {
  const schemaType = mongooseModel.schema.path(field);
  if (schemaType?.instance !== "ObjectId") return value;

  if (Array.isArray(value)) {
    // Drop entries that don't coerce rather than failing the whole query —
    // an $in/$nin list with one malformed id shouldn't error on the valid
    // ones. If nothing survives, the caller's operator branch (eq/in vs
    // ne/not_in) decides what an empty list should mean.
    const coerced = value
      .map((v) => coerceToObjectId(v))
      .filter((v): v is Types.ObjectId => v instanceof Types.ObjectId);
    return coerced.length > 0 ? coerced : UNCOERCIBLE;
  }

  const coerced = coerceToObjectId(value);
  return coerced instanceof Types.ObjectId ? coerced : UNCOERCIBLE;
}

/**
 * Builds a case-insensitive exact-match condition via an anchored, fully
 * escaped regex — MongoDB has no native case-insensitive equality operator.
 */
function insensitiveEq(field: string, value: string): Record<string, unknown> {
  return { [field]: { $regex: `^${escapeForMongoRegex(value)}$`, $options: "i" } };
}

function isStringOrStringArray(value: unknown): value is string | string[] {
  return (
    typeof value === "string" || (Array.isArray(value) && value.every((v) => typeof v === "string"))
  );
}

export function whereToMongoFilter(
  mongooseModel: AnyModel,
  model: string,
  where: CleanedWhere[] | undefined,
  getFieldName: GetFieldName,
): Record<string, unknown> {
  if (!where || where.length === 0) return {};

  const andClauses: Record<string, unknown>[] = [];
  const orClauses: Record<string, unknown>[] = [];

  for (const clause of where) {
    let field = getFieldName({ model, field: clause.field });
    if (field === "id") field = "_id";

    const value = coerceWhereValue(mongooseModel, field, clause.value);

    if (value === UNCOERCIBLE) {
      if (clause.operator === "ne" || clause.operator === "not_in") {
        // "not equal to a malformed id" is trivially true for every real
        // document — omit the condition rather than querying at all.
        continue;
      }
      // eq/in/gt/gte/lt/lte/contains/starts_with/ends_with against a
      // malformed id can never match a real document.
      (clause.connector === "OR" ? orClauses : andClauses).push({ [field]: { $in: [] } });
      continue;
    }

    // An id-typed value is never a string by this point (coerceWhereValue
    // already turned it into a Types.ObjectId), so this also naturally
    // excludes id/reference fields from case folding, matching Better
    // Auth's own reference `@better-auth/mongo-adapter` behavior.
    const insensitive = clause.mode === "insensitive" && isStringOrStringArray(value);

    let condition: Record<string, unknown>;

    switch (clause.operator) {
      case "eq":
        condition = insensitive ? insensitiveEq(field, value as string) : { [field]: value };
        break;
      case "ne":
        condition = insensitive
          ? { [field]: { $not: insensitiveEq(field, value as string)[field] } }
          : { [field]: { $ne: value } };
        break;
      case "in":
        // An empty allow-list must always match nothing. `{ [field]: { $in:
        // [] } }` has that well-defined native meaning on every supported
        // MongoDB version; `{ $or: [] }` (what mapping each element through
        // insensitiveEq would otherwise produce for a 0-length list) does
        // not; empirically, it matches *every* document instead — the
        // opposite of an empty in-list's intended meaning, and a real
        // cross-tenant-style data exposure if a caller's allow-list ever
        // narrows to empty at runtime. Bypassing the insensitive branch
        // entirely for the empty case sidesteps that regardless of mode.
        condition =
          insensitive && (value as string[]).length > 0
            ? { $or: (value as string[]).map((v) => insensitiveEq(field, v)) }
            : { [field]: { $in: value } };
        break;
      case "not_in":
        // Mirrors the `in` case above: an empty exclusion list must always
        // match everything, which `{ [field]: { $nin: [] } }` guarantees
        // natively, without relying on `{ $nor: [] }`'s equivalent-but-
        // version-fragile empty-array behavior.
        condition =
          insensitive && (value as string[]).length > 0
            ? { $nor: (value as string[]).map((v) => insensitiveEq(field, v)) }
            : { [field]: { $nin: value } };
        break;
      case "contains":
        condition = {
          [field]: {
            $regex: escapeForMongoRegex(String(value)),
            ...(insensitive ? { $options: "i" } : {}),
          },
        };
        break;
      case "starts_with":
        condition = {
          [field]: {
            $regex: `^${escapeForMongoRegex(String(value))}`,
            ...(insensitive ? { $options: "i" } : {}),
          },
        };
        break;
      case "ends_with":
        condition = {
          [field]: {
            $regex: `${escapeForMongoRegex(String(value))}$`,
            ...(insensitive ? { $options: "i" } : {}),
          },
        };
        break;
      default: {
        const mongoOp = OPERATOR_MAP[clause.operator] ?? "$eq";
        condition = { [field]: { [mongoOp]: value } };
      }
    }

    (clause.connector === "OR" ? orClauses : andClauses).push(condition);
  }

  const filter: Record<string, unknown> = {};
  if (andClauses.length) filter.$and = andClauses;
  if (orClauses.length) filter.$or = orClauses;
  return filter;
}

function toProjection(
  model: string,
  select: string[] | undefined,
  getFieldName: GetFieldName,
): Record<string, 1> | undefined {
  if (!select || select.length === 0) return undefined;
  return Object.fromEntries(
    select.map((logicalField) => {
      let field = getFieldName({ model, field: logicalField });
      if (field === "id") field = "_id";
      return [field, 1] as const;
    }),
  );
}

export function makeFindOne(
  models: Map<string, AnyModel>,
  getFieldName: GetFieldName,
  session?: ClientSession,
): CustomAdapter["findOne"] {
  return async ({ model, where, select, join }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(mongooseModel, model, where, getFieldName);
    let query = mongooseModel
      .findOne(filter, toProjection(model, select, getFieldName))
      .session(session ?? null);
    query = applyJoin(query, join, model, getFieldName);

    // CustomAdapter's methods are individually generic (`<T>`), which a plain
    // arrow function implementing the interface can't bind to by name — this
    // cast is TypeScript's known limitation implementing generic call
    // signatures structurally, not a real type hole.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await query.lean().exec()) as any;
  };
}

export function makeFindMany(
  models: Map<string, AnyModel>,
  getFieldName: GetFieldName,
  session?: ClientSession,
): CustomAdapter["findMany"] {
  return async ({ model, where, limit, select, sortBy, offset, join }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(mongooseModel, model, where, getFieldName);
    let query = mongooseModel
      .find(filter, toProjection(model, select, getFieldName))
      .session(session ?? null)
      .limit(limit);
    if (offset) query = query.skip(offset);
    if (sortBy) {
      let sortField = getFieldName({ model, field: sortBy.field });
      if (sortField === "id") sortField = "_id";
      query = query.sort({ [sortField]: sortBy.direction === "asc" ? 1 : -1 });
    }
    query = applyJoin(query, join, model, getFieldName);

    // CustomAdapter's methods are individually generic (`<T>`), which a plain
    // arrow function implementing the interface can't bind to by name — this
    // cast is TypeScript's known limitation implementing generic call
    // signatures structurally, not a real type hole.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await query.lean().exec()) as any;
  };
}

export function makeCount(
  models: Map<string, AnyModel>,
  getFieldName: GetFieldName,
  session?: ClientSession,
): CustomAdapter["count"] {
  return async ({ model, where }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(mongooseModel, model, where, getFieldName);
    return mongooseModel.countDocuments(filter).session(session ?? null);
  };
}
