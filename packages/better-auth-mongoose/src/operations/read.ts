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

function coerceWhereValue(mongooseModel: AnyModel, field: string, value: unknown): unknown {
  const schemaType = mongooseModel.schema.path(field);
  if (schemaType?.instance !== "ObjectId") return value;
  if (Array.isArray(value)) return value.map((v) => coerceToObjectId(v));
  return coerceToObjectId(value);
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
    let condition: Record<string, unknown>;

    switch (clause.operator) {
      case "eq":
        condition = { [field]: value };
        break;
      case "contains":
        condition = { [field]: { $regex: escapeForMongoRegex(String(value)) } };
        break;
      case "starts_with":
        condition = { [field]: { $regex: `^${escapeForMongoRegex(String(value))}` } };
        break;
      case "ends_with":
        condition = { [field]: { $regex: `${escapeForMongoRegex(String(value))}$` } };
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

function toProjection(select: string[] | undefined): Record<string, 1> | undefined {
  if (!select || select.length === 0) return undefined;
  return select.reduce((acc, field) => ({ ...acc, [field]: 1 }), {} as Record<string, 1>);
}

export function makeFindOne(
  models: Map<string, AnyModel>,
  getFieldName: GetFieldName,
): CustomAdapter["findOne"] {
  return async ({ model, where, select, join }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(mongooseModel, model, where, getFieldName);
    let query = mongooseModel.findOne(filter, toProjection(select));
    query = applyJoin(query, join);

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
): CustomAdapter["findMany"] {
  return async ({ model, where, limit, select, sortBy, offset, join }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(mongooseModel, model, where, getFieldName);
    let query = mongooseModel.find(filter, toProjection(select)).limit(limit);
    if (offset) query = query.skip(offset);
    if (sortBy) {
      let sortField = getFieldName({ model, field: sortBy.field });
      if (sortField === "id") sortField = "_id";
      query = query.sort({ [sortField]: sortBy.direction === "asc" ? 1 : -1 });
    }
    query = applyJoin(query, join);

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
): CustomAdapter["count"] {
  return async ({ model, where }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(mongooseModel, model, where, getFieldName);
    return mongooseModel.countDocuments(filter);
  };
}
