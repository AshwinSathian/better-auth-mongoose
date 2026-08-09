import type { ClientSession } from "mongoose";
import type { CustomAdapter } from "@better-auth/core/db/adapter";
import type { AnyModel } from "../types";

// MongoDB rejects implicitly creating a collection as part of the *first*
// write inside a multi-document transaction ("...due to catalog changes;
// please retry the operation") — so before any transactional create, the
// collection must already exist. createCollection() is a real round trip
// even when the collection already exists (Mongoose swallows the resulting
// NamespaceExists error), so this is memoized per model instance rather
// than run on every create() call.
const ensuredCollections = new WeakMap<AnyModel, Promise<void>>();

function ensureCollectionExists(mongooseModel: AnyModel): Promise<void> {
  let promise = ensuredCollections.get(mongooseModel);
  if (!promise) {
    promise = mongooseModel.createCollection().then(() => undefined);
    ensuredCollections.set(mongooseModel, promise);
  }
  return promise;
}

export function makeCreate(
  models: Map<string, AnyModel>,
  session?: ClientSession,
): CustomAdapter["create"] {
  return async ({ model, data }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    await ensureCollectionExists(mongooseModel);

    const [created] = await mongooseModel.create([data], { session });
    return created.toObject() as typeof data;
  };
}
