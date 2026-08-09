import type { ClientSession } from "mongoose";
import type { CustomAdapter } from "@better-auth/core/db/adapter";
import { whereToMongoFilter, type GetFieldName } from "./read";
import type { AnyModel } from "../types";

export function makeDelete(
  models: Map<string, AnyModel>,
  getFieldName: GetFieldName,
  session?: ClientSession,
): CustomAdapter["delete"] {
  return async ({ model, where }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(mongooseModel, model, where, getFieldName);
    await mongooseModel.deleteOne(filter, { session }).exec();
  };
}

export function makeDeleteMany(
  models: Map<string, AnyModel>,
  getFieldName: GetFieldName,
  session?: ClientSession,
): CustomAdapter["deleteMany"] {
  return async ({ model, where }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(mongooseModel, model, where, getFieldName);
    const result = await mongooseModel.deleteMany(filter, { session }).exec();
    return result.deletedCount ?? 0;
  };
}

export function makeConsumeOne(
  models: Map<string, AnyModel>,
  getFieldName: GetFieldName,
  session?: ClientSession,
): NonNullable<CustomAdapter["consumeOne"]> {
  return async ({ model, where }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(mongooseModel, model, where, getFieldName);
    // findOneAndDelete is atomic in MongoDB — no separate find+delete race window,
    // exactly one concurrent caller receives the row, the rest receive null.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await mongooseModel.findOneAndDelete(filter, { session }).lean().exec()) as any;
  };
}
