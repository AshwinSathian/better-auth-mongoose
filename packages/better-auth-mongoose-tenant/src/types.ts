import type { Connection, Model } from "mongoose";

/**
 * Mongoose's `Model<T>` requires a document type parameter, but this package
 * scopes arbitrary consumer-defined models with no shared document shape.
 * The one sanctioned `any` in the public type surface — every other file
 * imports this alias instead of writing `Model<any>` directly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModel = Model<any>;

export interface TenantScopedOptions {
  /** Names of Mongoose models (already registered) to scope. */
  scopedModels: string[];
  /** Field name holding the tenant identifier on each scoped model. Default: "organizationId". */
  tenantField?: string;
  /** Returns the active tenant id for the current request/session context. */
  getActiveTenantId: () => string | undefined;
  /**
   * The connection scoped models are registered on. Defaults to the global
   * mongoose connection. Pass this when your app uses
   * mongoose.createConnection() instead of mongoose.connect(), or runs more
   * than one connection.
   */
  connection?: Connection;
}
