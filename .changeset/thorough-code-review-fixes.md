---
"better-auth-mongoose": patch
"better-auth-mongoose-tenant": patch
---

**better-auth-mongoose:**

- Fix `where` clauses with `mode: "insensitive"` (eq, ne, in, not_in, contains, starts_with, ends_with) being silently treated as case-sensitive — this adapter now implements the same case-insensitive matching as Better Auth's official `@better-auth/mongo-adapter`, and is verified against the official `caseInsensitiveTestSuite` adapter contract test.
- Fix `createSchema()` (the `npx @better-auth/cli generate` output) emitting a literal `default: undefined` for any field with a function-based `defaultValue` (e.g. Better Auth's own `createdAt`/`updatedAt`), silently dropping the default generator from the ejected schema file.
- Stop re-probing transaction/session support (a full extra session + transaction round trip) on every single `transaction()` call — the result is now memoized per connection, roughly halving the overhead of every transactional operation.
- Fix a field that only changes its `index` flag between calls not triggering a model rebuild/`syncIndexes()`, which could leave a stale index on the real collection.

**better-auth-mongoose-tenant:**

- `applyTenantScope` now also scopes `deleteOne`, `deleteMany`, `updateOne`, `updateMany`, `findOneAndDelete`, and `findOneAndReplace`, not just the read methods and `save`. Previously, a blanket `Model.deleteMany({})` or `Model.updateMany({}, ...)` on a "scoped" model ran completely unscoped across every tenant — the exact cross-tenant blast radius this package exists to prevent. `findOneAndReplace`'s replacement document also gets the tenant field force-stamped, so a full-document replace can no longer omit or override it.
