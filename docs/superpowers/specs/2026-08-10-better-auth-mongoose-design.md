# `better-auth-mongoose` — Design Spec

**Status:** Approved
**Author:** Ashwin Sathian
**Last updated:** 2026-08-10

---

## 0. Summary

Better Auth's official MongoDB adapter talks to the raw `mongodb` driver, not Mongoose. Apps that already use Mongoose (the standard ODM for Node+Mongo, especially NestJS/Express) end up with two parallel connections, duplicate schema definitions, broken `.populate()`, and ID type mismatches (`string` vs `ObjectId`). This is a live, unresolved complaint on Better Auth's GitHub (issue #1492, discussion #9364, issue #6289, discussion #1921) since ~Feb 2025.

This project ships:
1. **`better-auth-mongoose`** — a Mongoose-native Better Auth adapter that registers real, extensible Mongoose models for Better Auth's collections, so `.populate()`, schema validation, and hooks work normally.
2. **`better-auth-mongoose-tenant`** — an optional plugin adding tenant-scoped query middleware on top, plus (pending investigation) a fix for the Mongo-specific active-organization bug (issue #3695).

The full problem statement, rejected alternatives, and chosen architecture (Option C: adapter accepts consumer-provided/extendable Mongoose schemas, merges with Better Auth's required fields) are as specified in the original technical spec provided by the author on 2026-08-10 (reproduced in full in `docs/superpowers/specs/2026-08-10-original-spec.md`). This document covers the decisions made to turn that spec into an executable, gold-standard-OSS-repo project: repo structure, tooling, scope sequencing, and the example/verification requirement added during brainstorming.

---

## 1. Goals (unchanged from original spec)

- G1. Drop-in `mongooseAdapter(connection, options)` satisfying Better Auth's full adapter contract.
- G2. Better Auth's internal collections are real, registered Mongoose models (`.populate()`, validation, hooks all work).
- G3. Zero duplicate connections — one shared Mongoose connection.
- G4. Consumers can extend `user` (and other) schemas with app-specific fields without forking the adapter.
- G5. Full parity with `@better-auth/test-utils`' official adapter test suite.
- G6. Optional tenant-scoping plugin fixing the documented Mongo `organization`-plugin bug plus tenant-safe query helpers.
- G7. Get listed on Better Auth's Community Adapters page; build credibility toward possible official-adapter promotion (stretch).
- **G8 (added during brainstorming):** Every usage claim in the README and docs must be backed by a real, runnable, CI-verified example — not just narrative code snippets. The differentiator (`.populate()` working) is proven by an executable integration test AND a standalone example app someone can clone and run.

## 2. Non-goals (unchanged)

Not a competing auth framework; not supporting Mongoose <6 / MongoDB <5.0 initially; not solving multi-DB-per-tenant; not building a NestJS wrapper (defers to `@thallesp/nestjs-better-auth`).

## 3. Architecture (unchanged from original spec — Option C)

Adapter ships default Mongoose schemas for all core + enabled-plugin models, auto-registers them, but accepts per-model consumer schemas via `options.schemas` which get merged with Better Auth's required fields (sourced from `getAuthTables(options)`). IDs stored as native `ObjectId` in the DB, converted to `string` only at `transformOutput`, so `.populate()` works and Better Auth's core still sees strings. Joins map to `.populate()`. Transactions use Mongoose sessions with graceful standalone-Mongo fallback (detected at init, not assumed).

Full API surface, per-method adapter contract mapping, ID-mapping rationale, and join/transaction handling: as specified in `2026-08-10-original-spec.md` §4–§6. No changes made to this technical design.

## 4. Repo structure — decided in brainstorming

Single monorepo, not split repos: `github.com/AshwinSathian/better-auth-mongoose`.

```
better-auth-mongoose/
├── .github/
│   ├── workflows/          # ci.yml, release.yml, codeql.yml
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── dependabot.yml
├── packages/
│   ├── better-auth-mongoose/         # core adapter (M1-M5)
│   └── better-auth-mongoose-tenant/  # tenant plugin (M7; M6 fix pending investigation)
├── examples/
│   └── nestjs-mongoose/              # worked, runnable example (satisfies G8)
├── docs/
│   └── superpowers/specs/            # this spec + original spec
├── .changeset/
├── turbo.json
├── pnpm-workspace.yaml
├── package.json                      # root, private
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── LICENSE                           # MIT, (c) Ashwin Sathian
└── README.md                         # monorepo overview, links to package READMEs
```

**Why monorepo over split repos:** shared CI/lint/test config, atomic cross-package changes (e.g. adapter contract change affecting both packages), one place for issues/discussions, matches how Better Auth's own ecosystem and comparable projects (drizzle-orm) are organized. Packages still version and publish independently via Changesets' independent-versioning mode.

## 5. Tooling — decided in brainstorming

- **Package manager:** pnpm (workspaces), Node 20 as primary dev target, CI matrix on Node 18/20/22.
- **Build orchestration:** Turborepo (caches build/test/lint across packages).
- **Bundler:** `tsup`, dual ESM/CJS, matching Better Auth's own adapter export conventions.
- **Tests:** Vitest + `mongodb-memory-server` (started as a single-node replica set so transaction tests are meaningful) + `@better-auth/test-utils`'s `testAdapter`/`createTestSuite` for contract parity.
- **Lint/format:** ESLint (flat config) + Prettier, enforced via Husky pre-commit + lint-staged, and in CI.
- **Versioning/release:** Changesets, independent per-package versions. `release.yml` opens/updates a "Version Packages" PR on merge to `main`; merging that PR publishes to npm via `NPM_TOKEN` secret (provided by the user post-hoc — first publish/login is a manual step, see §7).
- **Security/hygiene:** CodeQL workflow, Dependabot (npm + GitHub Actions ecosystems), `SECURITY.md` with a real disclosure process.
- **TypeScript:** strict mode across the board; full type inference for merged schema shapes (`AuthModels.User` etc. typed, not `any`).
- **License:** MIT, © Ashwin Sathian, matching Better Auth and its adapter ecosystem (required for the eventual community-adapter PR).

## 6. Example/verification requirement (G8, added in brainstorming)

The user explicitly requires tested, verified usage examples, not just README snippets. Concretely:

- `examples/nestjs-mongoose/` is a real, runnable NestJS app: Mongoose connection, `mongooseAdapter`, an extended `user` schema (`role`, `tenantId`), a `Post` model with `author: { type: ObjectId, ref: 'user' }`, and an endpoint that signs up a user then fetches a post with `.populate('author')` resolved. This is the single test that proves G2/G4 — it's the first thing linked from the README, not buried in `/test`.
- The example has its own `package.json` and is exercised in CI (spin up `mongodb-memory-server`, boot the example app or run its test suite headlessly, assert the populate result) — not just "builds," but actually run.
- The core adapter package's own `test/populate.test.ts` (per original spec §9) covers the same scenario at the unit/integration level, independent of the example app, so the claim is verified at two levels.
- README code samples are pulled from files under `examples/` or `packages/*/test/fixtures/` wherever practical (or at minimum type-checked in CI via a docs-snippet-compile step), so samples can't silently drift from working code.

## 7. Scope sequencing for this execution pass

Given the original spec's milestones (M1–M8) span an estimated 3-4+ weeks including third-party-repo actions, this pass is scoped as follows (confirmed with user):

**Executed fully now, autonomously:**
- M1 core adapter (create/update/delete/find/count, default schemas, ID mapping)
- M2 schema merge/extension support
- M3 `consumeOne`, joins/populate, transactions with standalone fallback
- M4 `@better-auth/test-utils` parity suite + populate integration test
- M5 docs, READMEs, worked NestJS example (with CI verification — see G8)
- M7 tenant plugin: scoped-query middleware package (self-contained, no third-party dependency)
- Full repo scaffolding: CI, CodeQL, Dependabot, issue/PR templates, CONTRIBUTING/CODE_OF_CONDUCT/SECURITY, Changesets release pipeline
- GitHub repo creation and push under the user's account

**Investigated/drafted now, NOT submitted without explicit user review:**
- M6: root-causing issue #3695 in `better-auth/better-auth` — real research against the live repo; a fix PR is drafted but held for the user to review/submit, since it's a PR to a third-party repo under their identity.
- M8: Community Adapters page PR (`docs/content/docs/adapters/community-adapters.mdx` in `better-auth/better-auth`), and outreach replies (Discord, discussion #1921) — drafted, not sent, same reasoning.

**Manual step required from the user (cannot be done autonomously):**
- npm login / first publish (2FA), and adding `NPM_TOKEN` to the GitHub repo's Actions secrets so `release.yml` can auto-publish subsequent versions.

## 8. Testing strategy (unchanged from original spec, +G8 addition)

Per original spec §9: unit tests via `@better-auth/test-utils` against `mongodb-memory-server`; the populate/differentiator integration test; schema-merge tests; ID-mapping tests; standalone-mode graceful-degradation test. Added: the runnable example app under `examples/`, exercised in CI, per §6 above.

## 9. Non-functional requirements (unchanged from original spec §10)

Peer-dep on `mongoose` and `better-auth`, no direct `mongodb` dependency; dual ESM/CJS; strict TypeScript; conservative peer range on `better-auth` with CI against its latest 2-3 minors; MIT license.

## 10. Risks (unchanged from original spec §12, +1)

- Better Auth changes its adapter contract again — mitigated via CI matrix + stated supported-version range.
- Maintainers ship their own Mongoose adapter first — checked at spec time (Aug 2026): no first-party Mongoose adapter exists or is on their public roadmap.
- Scope creep into an ODM-agnostic framework — resisted, stays Mongoose-specific.
- **Added:** M6 investigation may reveal the bug is already fixed, not reproducible, or architecturally deeper than a small patch — if so, document findings honestly in the tenant package's README rather than forcing a fix.
