# better-auth-mongoose-tenant

## 0.1.3

### Patch Changes

- 099d2ff: Close the whole class of tenant-scoping bypass, not just the two methods a second-pass review flagged. Model.where() and chaining .where('organizationId').equals(...) after an already-scoped call no longer bypass scoping: a new Query.prototype.exec patch enforces the tenant field on every query built against a scoped model at the last possible moment, regardless of how it was constructed, and also covers the standalone replaceOne(), distinct(), and exists() without needing separate wrappers. Update bodies can no longer reassign the tenant field via $set or strip it via $unset/$rename. Model.create() and Model.insertOne() now stamp the tenant field correctly (they call doc.$save(), a separate property from doc.save() that the previous fix didn't touch). insertMany() and bulkSave() are now scoped too. estimatedDocumentCount() throws instead of silently returning every tenant's count, since it has no filter to scope by.

## 0.1.2

### Patch Changes

- 873f592: Close two tenant-isolation gaps found in an external review. findById(), findByIdAndUpdate(), and findByIdAndDelete() now delegate to the already-scoped findOne-family methods instead of bypassing tenant scoping entirely, so a caller-supplied id from another tenant returns null instead of that tenant's document. tenantScoped() also accepts an optional connection option, so apps using mongoose.createConnection() (instead of the global default connection) can use it. applyTenantScope() is now idempotent: calling it twice on the same model no longer stacks a second layer of wrapping.

## 0.1.1

### Patch Changes

- ffe9cca: Raise the minimum supported Node.js version to `>=20.19.0`, matching what Mongoose 9 and the `mongodb` driver it depends on already require. Node 18 was already broken at runtime (`crypto is not defined` — no global Web Crypto API) and reached EOL in April 2025; `engines.node` and the CI matrix now reflect that accurately.
- 79a3ffe: Normalize the `repository.url` field to the canonical `git+https://...git` format npm expects, removing the "repository.url was normalized" warning `npm publish` emitted on every publish.
- 025c701: **better-auth-mongoose:**

  - Fix `where` clauses with `mode: "insensitive"` (eq, ne, in, not_in, contains, starts_with, ends_with) being silently treated as case-sensitive — this adapter now implements the same case-insensitive matching as Better Auth's official `@better-auth/mongo-adapter`, and is verified against the official `caseInsensitiveTestSuite` adapter contract test.
  - Fix `createSchema()` (the `npx @better-auth/cli generate` output) emitting a literal `default: undefined` for any field with a function-based `defaultValue` (e.g. Better Auth's own `createdAt`/`updatedAt`), silently dropping the default generator from the ejected schema file.
  - Stop re-probing transaction/session support (a full extra session + transaction round trip) on every single `transaction()` call — the result is now memoized per connection, roughly halving the overhead of every transactional operation.
  - Fix a field that only changes its `index` flag between calls not triggering a model rebuild/`syncIndexes()`, which could leave a stale index on the real collection.

  **better-auth-mongoose-tenant:**

  - `applyTenantScope` now also scopes `deleteOne`, `deleteMany`, `updateOne`, `updateMany`, `findOneAndDelete`, and `findOneAndReplace`, not just the read methods and `save`. Previously, a blanket `Model.deleteMany({})` or `Model.updateMany({}, ...)` on a "scoped" model ran completely unscoped across every tenant — the exact cross-tenant blast radius this package exists to prevent. `findOneAndReplace`'s replacement document also gets the tenant field force-stamped, so a full-document replace can no longer omit or override it.
