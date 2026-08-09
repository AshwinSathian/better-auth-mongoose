import type { ClientSession } from "mongoose";
import type { CustomAdapter } from "@better-auth/core/db/adapter";
import { whereToMongoFilter, type GetFieldName } from "./read";
import type { AnyModel } from "../types";

export function makeUpdate(
  models: Map<string, AnyModel>,
  getFieldName: GetFieldName,
  session?: ClientSession,
): CustomAdapter["update"] {
  return async ({ model, where, update }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(mongooseModel, model, where, getFieldName);

    // A plain object update document is treated by MongoDB as a full
    // document replacement, not a partial update — it must be wrapped in
    // $set to only touch the given fields.
    const doc = await mongooseModel
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .findOneAndUpdate(filter, { $set: update as any }, { returnDocument: "after", session })
      .lean()
      .exec();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return doc as any;
  };
}

export function makeUpdateMany(
  models: Map<string, AnyModel>,
  getFieldName: GetFieldName,
  session?: ClientSession,
): CustomAdapter["updateMany"] {
  return async ({ model, where, update }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(mongooseModel, model, where, getFieldName);
    const result = await mongooseModel.updateMany(filter, { $set: update }, { session }).exec();
    return result.modifiedCount;
  };
}
