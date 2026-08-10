# `better-auth-mongoose` — Technical Spec (Original, as authored)

**Status:** Draft v1
**Author:** Ashwin Sathian
**Last updated:** August 2026

---

## 0. TL;DR

Better Auth ships an official MongoDB adapter, but it talks to the raw `mongodb` driver, not Mongoose. If your app already uses Mongoose (most NestJS + Mongo apps do), you end up with two parallel connections to the same database, duplicate schema definitions, broken `.populate()` calls, and a forced extra dependency. This has been a live, unresolved complaint on Better Auth's own GitHub since February 2025. Nobody has shipped a fix. This spec defines a Mongoose-native adapter that closes that gap, plus an optional tenant-scoping plugin layered on top, and a concrete path to getting it listed (and ideally semi-endorsed) by the Better Auth project itself.

---

## 1. Problem statement

### 1.1 What's broken today

Better Auth's `mongodbAdapter()`:

- Requires the raw `mongodb` driver as a dependency, even in projects that only use Mongoose (issue #1492).
- Writes `user`, `session`, `account`, `verification` documents directly via `MongoClient`, bypassing Mongoose entirely — no schema validation, no hooks, no virtuals.
- Doesn't register Mongoose models for its own collections, so when a consumer's app defines its own `User` model (to add app-specific fields, or to `.populate()` a `Post.author` reference), the two don't talk to each other cleanly. This produces silent bugs: `.populate()` failing to resolve, `_id` type mismatches (string vs ObjectId) between what Better Auth writes and what Mongoose expects (discussion #9364, issue #6289).
- Requires developers to manually reach into `mongoose.connection.getClient()` to extract a raw client just to hand it to Better Auth — a workaround, not a solution, that's been the _only_ answer offered on the project's own Discord/discussions for over a year.

### 1.2 Who this hurts

Anyone building a NestJS, Express, or Fastify backend on MongoDB who is already using Mongoose as their ODM (the standard choice in that ecosystem) and wants Better Auth instead of hand-rolling auth. That's a large, specific, identifiable slice of Better Auth's own user base — the MongoDB adapter is one of only five officially maintained adapters, meaning Mongo users are already a first-class segment, just an underserved one.

### 1.3 Why nobody's fixed it

Not because it's unwanted — the opposite. It's because:

- It's genuinely fiddly (see §4 below on model registration), more so than a typical CRUD adapter.
- Adapter authors who _do_ use Mongo in these threads reach for the raw-client workaround and move on, because it works well enough for a single side project.
- It requires understanding both Better Auth's adapter contract _and_ Mongoose's schema/model registration internals well enough to make the two coexist without collisions. That's a narrower skill overlap than "know Mongo."

---

## 2. Goals

- **G1.** A drop-in Mongoose adapter: `mongooseAdapter(connection, options)` that satisfies Better Auth's full adapter contract.
- **G2.** Auth's internal collections (`user`, `session`, `account`, `verification`, plus plugin-added ones like `organization`, `member`, `invitation`) are real, registered Mongoose models — so `.populate()`, schema validation, and hooks all work normally from the consumer's own code.
- **G3.** Zero duplicate connections. One Mongoose connection, shared.
- **G4.** Support for consumers who want to **extend** the `user` schema with app-specific fields (nearly everyone does — e.g. `role`, `tenantId`, `onboardingComplete`) without forking the adapter.
- **G5.** Full parity with the official adapter test suite (`@better-auth/test-utils`).
- **G6.** A second, optional package — a tenant-scoping plugin — that fixes the documented Mongo-specific bugs in the `organization` plugin (issue #3695: active-org switching broken on Mongo) and adds first-class tenant-safe query helpers.
- **G7.** Get it listed on Better Auth's official Community Adapters page, and build enough credibility to be considered for promotion to an officially maintained adapter (stretch goal, not required for v1 success).

## 3. Non-goals

- Not building a competing auth framework. This is infrastructure _for_ Better Auth, not a replacement for any part of it.
- Not trying to support Mongoose <6 or MongoDB <5.0 initially — match Better Auth's own current baseline, expand later only if there's demand.
- Not solving multi-database-per-tenant (separate physical DB per tenant) in v1 — v1 tenant-scoping is collection-scoped (shared DB, `tenantId` field), which is the overwhelmingly common pattern and matches what Better Auth's own `organization` plugin assumes.
- Not building a NestJS wrapper — `@thallesp/nestjs-better-auth` already does that well. This package is framework-agnostic, at the database layer only.

---

## 4. The core design decision (this is the whole ballgame)

There are three ways to build this, and picking the right one is 80% of the value of this spec.

### Option A — Raw-client passthrough with a Mongoose wrapper (rejected)

Just wrap `mongoose.connection.getClient()` automatically so people don't have to do it by hand. This is what every blog post and Stack Overflow answer already recommends. **Rejected** — it doesn't fix the actual bug (schema drift, `.populate()` breakage, no validation). It's a 10-line convenience function, not a package worth publishing, and it doesn't move the needle on the real pain.

### Option B — Adapter creates and owns its own Mongoose models internally (partial)

The adapter defines its own internal `AuthUserModel`, `AuthSessionModel`, etc., registered on the shared connection, and does all CRUD through those. Consumers never see or touch these models directly.

**Pro:** Simple, self-contained, no coordination needed with consumer code.
**Con:** Fails G4 — if the consumer wants `user.role` or `user.tenantId`, they can't add it, because the adapter's internal schema is closed. This is the single most common real-world need (nearly every SaaS app adds fields to the user model), so failing it means the package solves the toy case but not the real case.

### Option C — Adapter accepts consumer-provided (or consumer-extendable) Mongoose schemas, with sane defaults (chosen)

The adapter ships default Mongoose schemas for all Better Auth core models (`user`, `session`, `account`, `verification`) and any enabled plugin models (`organization`, `member`, etc., detected from `options.plugins`). By default it registers and uses these automatically — zero-config for the simple case. But it exposes a `schemas` config option letting the consumer pass their **own** schema per model, which the adapter merges with the required Better Auth fields (auto-injecting any field Better Auth needs that's missing, similar to how the adapter factory already backfills fields per the `schema` docs).

```ts
export const auth = betterAuth({
  database: mongooseAdapter(mongoose.connection, {
    schemas: {
      user: userSchemaExtension, // consumer's own Schema, gets merged
    },
  }),
});
```

Internally, the adapter:

1. Takes Better Auth's own generated schema (from `getAuthTables(options)` — the same source `createSchema` in the official Postgres/MySQL adapters reads) as the source of truth for required fields/types.
2. For each model, checks if the consumer already registered a Mongoose model under that name on the shared connection (`mongoose.models[name]`). If yes, adopts it, and validates it has (or extends it to have) every field Better Auth requires. If no, builds a default schema from Better Auth's field list and registers it.
3. Exposes the merged/final registered models so consumer code can `import { AuthModels } from 'better-auth-mongoose'` and get typed Mongoose models to run their own queries/populates against, rather than only ever talking to the database through Better Auth's own API.

**This is the differentiator.** It's the only approach where `.populate()` works, schema validation works, and the consumer can extend the user model — which is precisely the three complaints found in the GitHub research. Option C is what ships.

---

## 5. Package structure

```
better-auth-mongoose/
├── src/
│   ├── index.ts                 // public exports
│   ├── adapter.ts                // mongooseAdapter() factory
│   ├── schema/
│   │   ├── build-schema.ts       // Better Auth schema -> Mongoose SchemaDefinition
│   │   ├── default-schemas.ts    // built-in schemas for user/session/account/verification
│   │   ├── plugin-schemas.ts     // schemas for organization/member/invitation/apikey/etc
│   │   └── merge-schema.ts       // merges consumer schema + required fields
│   ├── transform/
│   │   ├── id-mapping.ts         // _id <-> id, ObjectId <-> string
│   │   ├── input.ts              // transformInput implementation
│   │   └── output.ts             // transformOutput implementation
│   ├── operations/
│   │   ├── create.ts
│   │   ├── update.ts
│   │   ├── update-many.ts
│   │   ├── delete.ts
│   │   ├── delete-many.ts
│   │   ├── consume-one.ts        // findOneAndDelete, atomic
│   │   ├── find-one.ts
│   │   ├── find-many.ts
│   │   └── count.ts
│   ├── join.ts                   // populate()-based join support
│   ├── transaction.ts            // Mongoose session-based transactions
│   └── types.ts
├── test/
│   ├── adapter.test.ts           // @better-auth/test-utils suite
│   ├── schema-merge.test.ts
│   ├── populate.test.ts          // proves G4/G2 — the actual differentiator
│   └── fixtures/
├── package.json
├── tsup.config.ts
├── tsconfig.json
├── CHANGELOG.md
└── README.md
```

Second package, published separately so people who don't need multi-tenancy don't pay for it:

```
better-auth-mongoose-tenant/
├── src/
│   ├── index.ts
│   ├── plugin.ts                 // Better Auth plugin: tenant-scoping hooks
│   ├── active-org-fix.ts         // patch for issue #3695 pattern on Mongo
│   ├── scoped-query.ts           // helper: auto-injects tenantId into queries
│   └── types.ts
├── test/
└── README.md
```

---

## 6. Detailed API surface

### 6.1 `mongooseAdapter(connection, options?)`

```ts
import { Connection } from "mongoose";

interface MongooseAdapterOptions {
  /** Use plural collection names (users, sessions...). Default: false, matches Better Auth default. */
  usePlural?: boolean;

  /** Per-model schema extensions. Merged with Better Auth's required fields. */
  schemas?: Partial<Record<AuthModelName, Schema>>;

  /** If true, reuse an existing registered Mongoose model instead of building one. Default: true. */
  adoptExistingModels?: boolean;

  /** Enable transactions via Mongoose sessions. Default: true if connection supports it (replica set/sharded). */
  transactions?: boolean;

  /** Debug logging, same shape as Better Auth's own debugLogs config. */
  debugLogs?: boolean | Partial<Record<AdapterMethod, boolean>>;
}

export function mongooseAdapter(
  connection: Connection,
  options?: MongooseAdapterOptions,
): (betterAuthOptions: BetterAuthOptions) => Adapter;
```

Usage:

```ts
import { betterAuth } from "better-auth";
import { mongooseAdapter } from "better-auth-mongoose";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI!);

export const auth = betterAuth({
  database: mongooseAdapter(mongoose.connection, {
    schemas: {
      user: new Schema({
        role: { type: String, default: "member" },
        tenantId: { type: Schema.Types.ObjectId, ref: "Tenant" },
      }),
    },
  }),
});
```

### 6.2 Adapter contract implementation notes

Per Better Auth's `createAdapterFactory` contract, every method below is required unless marked optional.

**`create({ model, data, select })`**
Maps to `Model.create(data)`. Must respect `forceAllowId` (Better Auth may pass `id` explicitly, e.g. during org invitation flows) — when present, set it as `_id` directly rather than letting Mongoose auto-generate.

**`update({ model, where, update })`**
Maps to `Model.findOneAndUpdate(whereToMongoFilter(where), update, { new: true })`. Must return `null` on no match, per spec (not throw).

**`updateMany({ model, where, update })`**
Maps to `Model.updateMany(...)`, returns `.modifiedCount`.

**`delete({ model, where })`**
Maps to `Model.deleteOne(...)`. Returns `void` per spec, even though Mongoose returns a result object — the wrapper discards it.

**`deleteMany({ model, where })`**
Maps to `Model.deleteMany(...)`, returns `.deletedCount`.

**`consumeOne({ model, where })`** (optional but implemented — this matters)
This is used for single-use tokens (email verification, magic links, one-time codes). Must be atomic to prevent race conditions on concurrent redemption. Maps directly to `Model.findOneAndDelete(whereToMongoFilter(where))` — Mongo's `findOneAndDelete` is natively atomic, so this is a correct native implementation, not a fallback. **Do not skip this** — the spec explicitly warns the `findMany` + `deleteMany` fallback is only race-safe under real multi-document transactions, and implementing `consumeOne` natively is one of the concrete reliability wins this package can point to over a naive implementation.

**`findOne({ model, where, select, join })`**
Maps to `Model.findOne(filter, projection)`. The `join` parameter is the interesting bit — see §6.3.

**`findMany({ model, where, limit, select, sortBy, offset, join })`**
Maps to `Model.find(filter, projection).sort().skip().limit()`.

**`count({ model, where })`**
Maps to `Model.countDocuments(filter)`.

**`createSchema({ file, tables })`** (optional)
Powers the Better Auth CLI's `generate` command. For Mongoose there's no migration file to generate in the traditional sense (no DDL), but this should emit a `.ts` file containing the Mongoose `Schema` definitions the adapter would build by default, so consumers can eject to fully custom schemas if they outgrow the merge-based extension model.

### 6.3 ID mapping — the fiddly part

Better Auth's internal model uses `id: string` everywhere. MongoDB's native ID is `_id: ObjectId`. The official raw-driver adapter handles this with `mapKeysTransformInput: { id: "_id" }` / `mapKeysTransformOutput: { _id: "id" }`, converting `ObjectId` to string on the way out.

This package must do the same mapping, but additionally must ensure that when the consumer's _own_ Mongoose schemas reference these IDs (e.g. `Post.author: { type: ObjectId, ref: 'user' }`), the types line up. Concretely:

- Store IDs as native `ObjectId` in the database (not stringified) — this is what makes `.populate()` work, since Mongoose's populate mechanism expects `ObjectId` refs.
- Convert to `string` only in `transformOutput`, at the boundary where Better Auth's own core reads the value — not in the database itself.
- This is exactly the bug reported in issue #6289 and discussion #9364: the raw-client adapter's ID handling and a hand-written Mongoose `ref` schema disagree on string-vs-ObjectId, and nobody currently documents the fix. Getting this right and documenting it clearly is itself a meaningful contribution independent of the rest of the package.

### 6.4 Joins (`experimental.joins`)

Better Auth 1.4+ supports adapter-level joins for performance (2-3x on `get-session`, `get-full-organization` per official docs). For Mongoose this maps naturally to `.populate()`. Implement `join` support by translating Better Auth's join config into a `.populate({ path, select })` chain. This is a genuine performance argument for this adapter over the raw-client one for latency-sensitive deployments, since Mongoose's populate over an already-open connection avoids a second round trip through a second driver instance.

### 6.5 Transactions

Mongoose supports sessions/transactions only on replica sets or sharded clusters (not standalone `mongod`). Detect this at adapter init (try a no-op session start, catch and disable gracefully) rather than assuming — a standalone dev-mode MongoDB instance is common enough (including, likely, your own local dev setup) that this must degrade gracefully rather than crash on boot.

---

## 7. Multi-tenancy plugin (`better-auth-mongoose-tenant`) — v2, separate package

Built on top of, not instead of, Better Auth's own `organization` plugin. Two components:

### 7.1 Bug fixes for documented Mongo-specific breakage

Issue #3695 ("Setting Active Organization not working with MongoDB") is open and unresolved as of this research. Root-causing and fixing this (likely: the org plugin's "is member of org" check assumes a join shape the raw Mongo adapter doesn't structurally guarantee) is both independently valuable and the single best trust-building contribution to make directly to the `better-auth/better-auth` repo itself — see §8.

### 7.2 Tenant-scoped query helpers

```ts
import { tenantScoped } from "better-auth-mongoose-tenant";

export const auth = betterAuth({
  database: mongooseAdapter(connection),
  plugins: [
    organization(),
    tenantScoped({
      // Automatically injects { organizationId: session.activeOrganizationId }
      // into every query on the listed app-level models, not just auth's own.
      scopedModels: ["Project", "Invoice", "Document"],
    }),
  ],
});
```

This uses Mongoose's `pre('find')` / `pre('findOne')` / `pre('save')` middleware hooks to automatically inject the active tenant's scoping field, rather than requiring every service method in the consumer's app to remember to add `.where({ organizationId })` by hand — which is exactly the class of bug ("tenant data must be scoped by design, not by convention") already in your own stated product philosophy.

---

## 8. Path to Better Auth's endorsement

This has to be sequenced carefully. Don't lead with "please endorse my package" — lead with fixes to problems they already know they have.

### Phase 0 — Build in the open, reference the evidence

Open the GitHub repo with a README that explicitly links issue #1492, discussion #9364, issue #6289, and discussion #1921 as the motivating problem — this is honest, and it signals to any Better Auth maintainer stumbling on it that you did the homework rather than building a vanity package.

### Phase 1 — Ship the adapter, get it correctness-verified

Use `@better-auth/test-utils`'s official `testAdapter` / `createTestSuite` harness (documented in their own adapter guide) to prove full contract parity. Passing their own test suite, published in the README with a badge, is the single highest-credibility signal you can offer before anyone reads a line of your code.

### Phase 2 — Fix the standing Mongo bug upstream, not just in your package

Submit a PR to `better-auth/better-auth` itself fixing issue #3695 (active-org on Mongo). This is a contribution to their core repo, not your package — it's the move that gets you recognized by maintainers as a credible contributor before you ever ask for anything.

### Phase 3 — Submit the community adapter PR

Per their own documented process: "if you want to share your adapter with the community, please open a pull request to add it to this list" — a PR against `docs/content/docs/adapters/community-adapters.mdx`. This is a low-friction, well-trodden path; every one of the 18 existing community adapters got in exactly this way.

### Phase 4 — Discord + Discussion #1921 close-the-loop

Reply directly on discussion #1921 (the original "Mongoose Adapter" thread) linking the shipped package. That thread already has an audience of people who explicitly asked for this — it's pre-qualified distribution, not cold outreach.

### Phase 5 — Stretch: official adapter promotion

Only pursue this after real usage numbers exist (npm downloads, GitHub stars, issues from real users). Frame it as "here's a year of adoption data" rather than asking upfront. Given MongoDB is one of only five _officially_ maintained adapters already, and Mongoose is the dominant ODM for it, there's a real, evidence-backed case to make later — but it has to be earned with usage data, not pitched cold.

---

## 9. Testing strategy

- Unit tests: `@better-auth/test-utils` (`testAdapter`, `createTestSuite`) against `mongodb-memory-server` (in-memory replica set, so transaction tests are meaningful, not just standalone-mode skipped).
- Integration test specifically proving the differentiator: define a consumer-side `Post` model with `author: { type: ObjectId, ref: 'user' }`, create a user through Better Auth, create a post referencing it, and assert `.populate('author')` resolves correctly. This is the single test that proves the package does what the raw-client adapter can't — it should be the first thing in the README, not buried in the test folder.
- Schema merge tests: consumer-provided schema + Better Auth's required fields, confirm no field is dropped or overwritten incorrectly.
- ID mapping tests: string in, ObjectId in DB, string out, `.populate()` still resolves.
- Standalone-mode graceful degradation test: confirm transactions disable cleanly (no crash) against a non-replica-set Mongo instance.

## 10. Non-functional requirements

- **Bundle/dependency footprint:** peer-depend on `mongoose` and `better-auth`, don't bundle either. Don't pull in the raw `mongodb` driver as a direct dependency at all — this directly resolves issue #1492's complaint, and is worth calling out explicitly in the README as a stated design goal.
- **Module format:** dual ESM/CJS build via `tsup`, matching Better Auth's own adapter packages' export conventions.
- **TypeScript:** strict mode, full type inference for the merged schema shape so consumers get typed `AuthModels.User` etc.
- **Versioning:** peer range on `better-auth` pinned conservatively (adapter contract has changed between 1.4 and 1.5, per their own test-utils migration note) with CI running against the latest 2-3 minor versions to catch breakage early.
- **License:** MIT, matching Better Auth and the rest of its adapter ecosystem — anything else makes the community-adapter PR a nonstarter.

## 11. Milestones and rough effort

| Phase | Scope                                                                        | Est. effort                     |
| ----- | ---------------------------------------------------------------------------- | ------------------------------- |
| M1    | Core adapter (create/update/delete/find/count), default schemas, ID mapping  | 1–1.5 weeks                     |
| M2    | Schema merge/extension support (the differentiator), consumer model adoption | 3–4 days                        |
| M3    | `consumeOne`, joins/populate, transactions with graceful standalone fallback | 3–4 days                        |
| M4    | Full `@better-auth/test-utils` parity suite + populate integration test      | 3–4 days                        |
| M5    | Docs, README, worked example repo (NestJS + Mongoose + this adapter)         | 2–3 days                        |
| M6    | Tenant plugin: org-plugin Mongo bug investigation + fix upstream             | 1–2 weeks (investigation-heavy) |
| M7    | Tenant plugin: scoped-query middleware package                               | 3–4 days                        |
| M8    | Community adapter PR, Discord/discussion outreach                            | ongoing, low-effort             |

Total to a genuinely solid v1 (M1–M5): roughly **3–4 weeks of focused evenings/weekends.** M6 is the long pole and the highest-credibility item — it's worth doing even if delayed, since it's the piece most likely to get a maintainer's attention directly.

## 12. Risks

- **Better Auth changes its adapter contract again** (it already has, 1.4→1.5, per their migration notes) — mitigate with a CI matrix and a clearly stated supported-version range, updated promptly on new majors.
- **Maintainers ship their own Mongoose adapter first.** Low probability given it's been an open, ignored request since at least October 2025, but worth checking their repo/roadmap before starting, and again before Phase 3.
- **Scope creep into a full ODM-agnostic adapter framework.** Resist — this package's entire value is being opinionated and Mongoose-specific. A generic abstraction layer is a different, much bigger project with worse odds.
