import type { Query } from "mongoose";
import type { JoinConfig } from "@better-auth/core/db/adapter";

// TEMPORARY passthrough — replaced with real populate() translation in the
// joins task (Task 14). Exists now so operations/read.ts has a stable
// import target with the correct real JoinConfig type already wired in.
export function applyJoin<ResultType, DocType>(
  query: Query<ResultType, DocType>,
  _join?: JoinConfig,
): Query<ResultType, DocType> {
  return query;
}
