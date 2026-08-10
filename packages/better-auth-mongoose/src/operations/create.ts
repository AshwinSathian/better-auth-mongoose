import type { ClientSession } from "mongoose";
import type { CustomAdapter } from "@better-auth/core/db/adapter";
import type { AnyModel } from "../types";

export function makeCreate(
  models: Map<string, AnyModel>,
  session?: ClientSession,
): CustomAdapter["create"] {
  return async ({ model, data }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const [created] = await mongooseModel.create([data], { session });
    return created.toObject() as typeof data;
  };
}
