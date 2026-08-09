import type { Query } from "mongoose";
import type { JoinConfig } from "@better-auth/core/db/adapter";
import type { GetFieldName } from "./operations/read";

/**
 * Translates a Better Auth JoinConfig into a Mongoose .populate() call.
 *
 * JoinConfig's real shape (verified against @better-auth/core@1.6.26) is
 * `{ [joinedModel]: { on: { from, to }, limit?, relation? } }`. Every
 * Better Auth relation references the target model's `id` field, so `to`
 * is always "id"/"_id" in practice — the local `from` field already carries
 * a Mongoose `ref` to the joined model (set by build-schema.ts for any
 * field with a `references` attribute), so a plain populate() on that path
 * is sufficient without needing a virtual or manual $lookup.
 */
export function applyJoin<ResultType, DocType>(
  query: Query<ResultType, DocType>,
  join: JoinConfig | undefined,
  model: string,
  getFieldName: GetFieldName,
): Query<ResultType, DocType> {
  if (!join) return query;

  for (const config of Object.values(join)) {
    let localField = getFieldName({ model, field: config.on.from });
    if (localField === "id") localField = "_id";

    query = query.populate({
      path: localField,
      ...(config.limit !== undefined ? { options: { limit: config.limit } } : {}),
    }) as typeof query;
  }

  return query;
}
