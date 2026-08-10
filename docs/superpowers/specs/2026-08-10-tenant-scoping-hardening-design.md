# Tenant-scoping hardening — Design Spec

**Status:** Approved
**Author:** Ashwin Sathian
**Last updated:** 2026-08-10

---

## 0. Summary

An external review of the published `better-auth-mongoose` and `better-auth-mongoose-tenant` packages confirmed the core adapter and tenant-scoping middleware work as designed, but flagged two real gaps in `better-auth-mongoose-tenant` and two smaller items. This spec covers the fix for all four, scoped to code already in this repo — it does not cover the review's separate distribution-channel suggestions (replying to GitHub discussions, PRs against third-party repos), which stay out of scope here since they publish content externally under the maintainer's name.

## 1. Problems

1. **`findById`/`findByIdAndUpdate`/`findByIdAndDelete` bypass tenant scoping entirely.** `applyTenantScope()` wraps `find`, `findOne`, `findOneAndUpdate`, `findOneAndDelete`, `findOneAndReplace`, `countDocuments`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, and `save`, but the `findById` family was left out on the stated grounds that an id filter has no shape to merge a tenant clause into. That reasoning holds for the filter itself, but not for the result: a caller who reaches for `findById(id)` — arguably the single most common Mongoose call — gets back a document regardless of which tenant it belongs to. This is documented in the README, but a documented hole is still a hole, and it sits on the exact method name a developer reaches for once they've stopped thinking about scoping (which is the whole point of installing this package).

2. **`tenantScoped()` only ever reads from the global `mongoose.models` singleton.** `mongooseAdapter()` in the sibling package takes an explicit `Connection`, supporting `mongoose.createConnection()` and multiple connections. `tenantScoped()`'s `init()` does not accept one — it always resolves `scopedModels` via `mongoose.models[modelName]`. Multi-connection setups (database-per-tenant fallback, multi-region) are more likely in a package about tenancy than in the average Mongoose app, so this is a real, not theoretical, limitation.

3. **`applyTenantScope()` has no idempotency guard.** Calling it twice on the same model (hot reload, multiple `betterAuth()` instances in a test file) re-wraps an already-wrapped method. Each layer still produces correct output today, but nothing stops the wrapping from silently compounding, and relying on that being harmless is not the same as it being guarded.

4. **A Dependabot PR is failing CI on `main`'s branch protection view.** Traced to PR #5 (dev-dependency group bump), which raises `typescript` to `7.0.2`; `typescript-eslint@8.66.0` explicitly does not support TS 7 yet (confirmed in the CI log — an upstream compatibility gap, not a bug in this repo's config).

## 2. Fix design

### 2.1 `findById` family — delegate to the already-scoped filter methods

Mongoose's own `Model.findById`, `findByIdAndUpdate`, and `findByIdAndDelete` are implemented as thin wrappers around `findOne({_id: id}, ...)`, `findOneAndUpdate({_id: id}, ...)`, and `findOneAndDelete({_id: id}, ...)` respectively (confirmed by reading `mongoose@9.9.1`'s source; the JSDoc for `findByIdAndDelete` states this explicitly and it has held across the 6–9 peer range). `applyTenantScope()` adds three more wrapped methods, defined _after_ the existing `SCOPED_METHODS` loop so they close over the already-scoped functions on `mutableModel`:

```
findById(id, ...rest)            -> mutableModel.findOne({ _id: id }, ...rest)
findByIdAndUpdate(id, update, ...rest) -> mutableModel.findOneAndUpdate({ _id: id }, update, ...rest)
findByIdAndDelete(id, ...rest)   -> mutableModel.findOneAndDelete({ _id: id }, ...rest)
```

Because they delegate to the scoped versions rather than re-implementing scoping, a lookup against another tenant's id returns `null` — indistinguishable from "not found," which avoids leaking whether a given id exists at all. No new error type, no dev/prod behavioral split: the fix holds in every environment, which is a stronger guarantee than a dev-only throw would have given.

This is a behavior change for existing consumers relying on the documented exclusion, so it ships as a `fix:` changeset (patch) with the behavior called out explicitly, and the README's "deliberately not scoped" language is corrected.

### 2.2 Explicit connection binding on `tenantScoped()`

Add an optional field to `TenantScopedOptions`:

```ts
connection?: Connection;
```

`init()` resolves each scoped model from `(options.connection ?? mongoose).models[modelName]` instead of always reading the global. Omitting it keeps today's behavior (global connection) so this is additive, not breaking. README gains a short example showing it passed alongside a non-default connection, mirroring how `mongooseAdapter()` already documents that pattern.

### 2.3 Idempotency guard

After wrapping, tag the model with a non-enumerable marker (`Object.defineProperty(model, kTenantScoped, { value: true })` using a module-level `Symbol`). If `applyTenantScope()` is called again on a model that already carries the marker, it returns immediately without re-wrapping. No error, no warning — the common triggers (hot reload, repeated test setup) are not misuse, so this should be quietly safe rather than noisy.

### 2.4 CI redness

- Add an `ignore` rule to `.github/dependabot.yml` for `typescript` major-version updates, so Dependabot stops proposing bumps `typescript-eslint` can't yet consume.
- Close PR #5 with a short comment explaining why, referencing the upstream `typescript-eslint` tracking issue for TS 7 support.

## 3. Testing

- `scoped-query.test.ts`: `findById` returns the document within the active tenant and `null` across tenants; same for `findByIdAndUpdate`/`findByIdAndDelete` (verify the other tenant's row is untouched); a model scoped twice does not double-apply (assert the filter only carries the tenant field once, not merged twice — or equivalently, that the wrapped function reference is stable across a second `applyTenantScope()` call).
- `plugin.test.ts`: `init()` resolves a model from a passed `connection` option rather than the global `mongoose.models`, using a second `mongoose.createConnection()` the same way `scoped-query.test.ts` already does.
- Existing tests must keep passing unmodified except where they assert the old `findById`-is-unscoped behavior (none currently do — it was documented but untested).

## 4. Out of scope

Items 2–5 of the review's "what's next" list (replying to Better Auth GitHub discussions, a `community-adapters.mdx` PR, a PR against `create-better-t-stack`) are not addressed here. They post content externally under the maintainer's identity and need explicit sign-off per item, separate from this code-focused pass.
