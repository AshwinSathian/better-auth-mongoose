import type { Model, Schema } from "mongoose";

/**
 * Mongoose's `Model<T>` requires a document type parameter, but this adapter
 * holds a heterogeneous map of models (user, session, account, ...) with no
 * single shared document shape. This is the one sanctioned `any` in the
 * public type surface — every other file imports this alias instead of
 * writing `Model<any>` directly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModel = Model<any>;

export interface MongooseAdapterOptions {
  /** Use plural collection names. Default: false, matches Better Auth's own default. */
  usePlural?: boolean;
  /** Per-model schema extensions, keyed by Better Auth's resolved model name (e.g. "user"). */
  schemas?: Partial<Record<string, Schema>>;
  /** Reuse an existing registered Mongoose model instead of building one. Default: true. */
  adoptExistingModels?: boolean;
  /** Enable transactions via Mongoose sessions. Default: true if the connection supports them. */
  transactions?: boolean;
  /** Debug logging, forwarded to createAdapterFactory's own debugLogs config. */
  debugLogs?: boolean;
}
