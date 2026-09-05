import type { AnyModel } from "./types";
import { getTenantScopeConfig, requireTenantId, type TenantScopeConfig } from "./tenant-marker";

/**
 * `applyTenantScope` deliberately never touches `Model.aggregate()` itself —
 * see README's "What's not scoped, and why": a pipeline's semantics are too
 * specific to guess at, so blindly prepending a `$match` stage generically
 * would be actively wrong for some pipelines (e.g. one that starts with a
 * `$documents`/`$unionWith` stage introducing rows from elsewhere, or one
 * whose first stage is already a `$match` this would silently AND against).
 * That leaves a real, easy-to-forget gap for the common case where a
 * consumer's own pipeline *does* want the ordinary "documents in my
 * collection belonging to the active tenant" filter: nothing before this
 * function stopped them from writing `Model.aggregate([...])` with no
 * tenant filter at all and getting every tenant's data back, silently.
 *
 * This throws through the exact same `requireTenantId` used by every other
 * enforcement path in this package if the model isn't tenant-scoped or no
 * active tenant id is available, so a consumer wiring this in gets the same
 * fail-closed guarantee as everywhere else, not a silently-empty filter.
 */
function configFor(model: AnyModel, callSite: string): TenantScopeConfig {
  const config = getTenantScopeConfig(model);
  if (!config) {
    throw new Error(
      `better-auth-mongoose-tenant: ${callSite}() called on "${model.modelName}", which isn't ` +
        `tenant-scoped — applyTenantScope() was never called for it, so there's no tenant field ` +
        `to filter by.`,
    );
  }
  return config;
}

/**
 * Returns the active tenant id for a tenant-scoped model, or throws if the
 * model isn't scoped or no active tenant id is available right now. For
 * building anything more bespoke than `tenantMatchStage()` covers — a
 * `$lookup`'s `let`/pipeline sub-query, a raw driver command, a `$match`
 * combined with other conditions via `$expr` — where you need the raw id
 * rather than a ready-made stage.
 */
export function getScopedTenantId(model: AnyModel): string {
  const config = configFor(model, "getScopedTenantId");
  return requireTenantId(config, model.modelName);
}

/**
 * Builds the `{ $match: { <tenantField>: <activeTenantId> } }` stage for a
 * tenant-scoped model's own aggregation pipelines. Spread it in wherever
 * your pipeline needs the tenant filter — typically first, but this makes
 * no assumption about pipeline order, since only your own pipeline knows
 * where a tenant filter is actually correct to apply (e.g. after an initial
 * `$documents`/`$unionWith` stage that introduces rows from elsewhere, the
 * filter likely belongs after that stage, not before it).
 *
 * #### Example
 *
 *     const rows = await Project.aggregate([
 *       tenantMatchStage(Project),
 *       { $group: { _id: "$status", count: { $sum: 1 } } },
 *     ]);
 */
export function tenantMatchStage(model: AnyModel): Record<string, unknown> {
  const config = configFor(model, "tenantMatchStage");
  return { $match: { [config.tenantField]: requireTenantId(config, model.modelName) } };
}
