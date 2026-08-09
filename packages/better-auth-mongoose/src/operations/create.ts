import type { CustomAdapter } from "@better-auth/core/db/adapter";
import type { AnyModel } from "../types";

export function makeCreate(models: Map<string, AnyModel>): CustomAdapter["create"] {
  return async ({ model, data }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const created = await mongooseModel.create(data);
    return created.toObject() as typeof data;
  };
}
