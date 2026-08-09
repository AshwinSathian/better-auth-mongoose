// Intentionally empty of hardcoded field lists: the real source of truth for
// user/session/account/verification fields is Better Auth's own
// getAuthTables(options) output, passed into registerModels as `dbSchema`.
// This file exists so schema/ has one place to add Mongoose-only defaults
// (e.g. schema options like `versionKey: false`) applied to every model.
export const DEFAULT_SCHEMA_OPTIONS = { versionKey: false, minimize: false } as const;
