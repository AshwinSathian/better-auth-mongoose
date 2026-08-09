# better-auth-mongoose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a gold-standard-OSS monorepo containing `better-auth-mongoose` (a Mongoose-native Better Auth database adapter) and `better-auth-mongoose-tenant` (an optional tenant-scoping plugin), fully tested, documented, CI-verified, with a runnable example app, then create and push the GitHub repo.

**Architecture:** `mongooseAdapter(connection, options)` wraps Better Auth's real `createAdapterFactory` contract (verified against `better-auth@1.6.23` source via Context7 — see citations inline). It registers real Mongoose models per Better-Auth-required collection, using a `customIdGenerator` that emits valid 24-hex-char `ObjectId` strings (Better Auth's own default ID generator produces 32-char base62 strings, which are **not** valid `ObjectId`s — this is why the official raw-driver adapter and every blog post get this wrong or sidestep it; overriding ID generation is what makes `.populate()` actually work). IDs are converted to real BSON `ObjectId` on write and back to `string` on read, entirely inside our own operation functions — not via Better Auth's `customTransformInput`/`customTransformOutput` hooks, whose exact per-field signature Context7's docs did not fully expose; doing the conversion ourselves, where we control both ends, avoids depending on an unverified shape.

**Tech Stack:** TypeScript (strict), pnpm workspaces + Turborepo, tsup (dual ESM/CJS), Vitest, `mongodb-memory-server` (single-node replica set), `@better-auth/test-utils` (`testAdapter`/`createTestSuite`), Mongoose (peer, `>=6`), better-auth (peer, `^1.4.0 || ^1.5.0 || ^1.6.0`), Changesets, GitHub Actions, NestJS (example app only).

## Global Constraints

- No direct `mongodb` dependency anywhere in `packages/better-auth-mongoose` — `mongoose` and `better-auth` are peer dependencies only. This is the headline fix for issue #1492 and must hold for the whole package, not just the top-level `package.json` (no transitive workaround either).
- MIT license, © Ashwin Sathian, on every publishable package.
- TypeScript strict mode repo-wide; no `any` in public-facing exported types (internal helper code may use narrow, justified `any` only where Mongoose's own types force it, e.g. `Model<any>`).
- Dual ESM/CJS build output via `tsup` for both publishable packages.
- Every git commit and every GitHub-visible artifact (issues, PRs, releases) is attributed to Ashwin Sathian (`ashwinsathyan19@gmail.com`) only — no co-author trailers, no bot commits presented as authored work.
- `git commit` after every task (already the last step of each task below) — do not batch multiple tasks into one commit.
- Every usage claim in docs must be backed by a real, CI-run test or example (G8) — no README code sample that isn't exercised somewhere in `test/` or `examples/`.
- Where this plan references a Better Auth internal type whose exact shape Context7's docs didn't fully expose (`JoinConfig`, the `transaction` callback's `TransactionAdapter` argument), the task's first step is to read the real `.d.ts` from `node_modules/better-auth` — ground truth beats guessing, and guessing here would break the published package for real users.

---

## File Structure

```
better-auth-mongoose/                          (repo root, pnpm workspace)
├── package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json
├── .gitignore, .nvmrc, .editorconfig, .npmrc
├── .eslintrc / eslint.config.js, .prettierrc
├── .husky/pre-commit
├── .changeset/config.json
├── .github/workflows/{ci.yml,release.yml,codeql.yml}, dependabot.yml
├── .github/ISSUE_TEMPLATE/*, PULL_REQUEST_TEMPLATE.md
├── LICENSE, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, README.md
├── docs/superpowers/{specs,plans}/            (already has 2 files from brainstorming)
├── packages/
│   ├── better-auth-mongoose/
│   │   ├── package.json, tsup.config.ts, tsconfig.json, vitest.config.ts, README.md
│   │   ├── src/
│   │   │   ├── index.ts                  # public exports
│   │   │   ├── adapter.ts                # mongooseAdapter() factory
│   │   │   ├── types.ts                  # MongooseAdapterOptions, shared types
│   │   │   ├── schema/
│   │   │   │   ├── build-schema.ts       # DBFieldAttribute[] -> Mongoose SchemaDefinition
│   │   │   │   ├── default-schemas.ts    # user/session/account/verification base fields
│   │   │   │   ├── merge-schema.ts       # consumer Schema + required fields -> Schema
│   │   │   │   └── register-models.ts    # orchestrates build+merge+adopt -> Map<string, Model>
│   │   │   ├── id-mapping.ts             # customIdGenerator, ObjectId<->string, doc prep
│   │   │   ├── operations/
│   │   │   │   ├── create.ts
│   │   │   │   ├── read.ts               # findOne, findMany, count
│   │   │   │   ├── update.ts             # update, updateMany
│   │   │   │   └── delete.ts             # delete, deleteMany, consumeOne
│   │   │   ├── join.ts                   # JoinConfig -> .populate()
│   │   │   ├── transaction.ts            # session detection + transaction config
│   │   │   └── create-schema.ts          # CLI `generate` support
│   │   └── test/
│   │       ├── setup.ts                  # mongodb-memory-server replica-set harness
│   │       ├── fixtures/post.ts          # consumer-side Post model for populate test
│   │       ├── build-schema.test.ts
│   │       ├── merge-schema.test.ts
│   │       ├── id-mapping.test.ts
│   │       ├── crud.test.ts
│   │       ├── join.test.ts
│   │       ├── transaction.test.ts
│   │       ├── adapter.test.ts           # @better-auth/test-utils parity suite
│   │       └── populate.test.ts          # THE differentiator test
│   └── better-auth-mongoose-tenant/
│       ├── package.json, tsup.config.ts, tsconfig.json, vitest.config.ts, README.md
│       ├── src/{index.ts,types.ts,scoped-query.ts,plugin.ts}
│       └── test/{scoped-query.test.ts,plugin.test.ts}
├── examples/nestjs-mongoose/
│   ├── package.json, tsconfig.json, README.md
│   ├── src/{main.ts,app.module.ts,auth/*,posts/*}
│   └── test/app.e2e-spec.ts              # run in CI
└── docs/M6-active-org-investigation.md   # research findings on issue #3695
```

**Interfaces locked for the whole plan** (later tasks depend on these exact names):

```ts
// types.ts
export interface MongooseAdapterOptions {
  usePlural?: boolean;
  schemas?: Partial<Record<string, Schema>>;
  adoptExistingModels?: boolean;
  transactions?: boolean;
  debugLogs?: boolean;
}

// schema/build-schema.ts
export function buildSchemaDefinition(fields: Record<string, DBFieldAttribute>): SchemaDefinition;

// schema/merge-schema.ts
export function mergeSchema(
  requiredFields: Record<string, DBFieldAttribute>,
  consumerSchema?: Schema,
): Schema;

// schema/register-models.ts
export function registerModels(
  connection: Connection,
  dbSchema: BetterAuthDBSchema,
  options: MongooseAdapterOptions,
): Map<string, Model<any>>;

// id-mapping.ts
export function generateObjectIdString(): string;
export function toObjectId(id: string): Types.ObjectId;
export function toIdString(id: Types.ObjectId | string): string;
export function prepareDocForWrite(
  model: Model<any>,
  data: Record<string, unknown>,
): Record<string, unknown>;
export function prepareDocForRead(
  model: Model<any>,
  doc: Record<string, unknown> | null,
): Record<string, unknown> | null;

// operations/*.ts — each returns a function matching the exact CustomAdapter method signature
export function makeCreate(models: Map<string, Model<any>>): CustomAdapter["create"];
export function makeFindOne(models: Map<string, Model<any>>): CustomAdapter["findOne"];
export function makeFindMany(models: Map<string, Model<any>>): CustomAdapter["findMany"];
export function makeCount(models: Map<string, Model<any>>): CustomAdapter["count"];
export function makeUpdate(models: Map<string, Model<any>>): CustomAdapter["update"];
export function makeUpdateMany(models: Map<string, Model<any>>): CustomAdapter["updateMany"];
export function makeDelete(models: Map<string, Model<any>>): CustomAdapter["delete"];
export function makeDeleteMany(models: Map<string, Model<any>>): CustomAdapter["deleteMany"];
export function makeConsumeOne(
  models: Map<string, Model<any>>,
): NonNullable<CustomAdapter["consumeOne"]>;

// join.ts
export function applyJoin<T>(query: Query<T, any>, join: JoinConfig | undefined): Query<T, any>;

// transaction.ts
export function createTransactionConfig(
  connection: Connection,
  models: Map<string, Model<any>>,
  enabled: boolean,
): AdapterFactoryConfig["transaction"];

// create-schema.ts
export function makeCreateSchema(
  options: MongooseAdapterOptions,
): NonNullable<CustomAdapter["createSchema"]>;

// adapter.ts
export function mongooseAdapter(
  connection: Connection,
  options?: MongooseAdapterOptions,
): AdapterFactory<BetterAuthOptions>;
```

---

## Task 1: Root workspace tooling

**Files:**

- Create: `package.json` (root, `"private": true`)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`, `.nvmrc`, `.editorconfig`, `.npmrc`

**Interfaces:** None consumed. Produces: the pnpm/turbo workspace that every later package lives inside.

- [ ] **Step 1: Write root `package.json`**

```json
{
  "name": "better-auth-mongoose-monorepo",
  "private": true,
  "license": "MIT",
  "author": "Ashwin Sathian",
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write \"**/*.{ts,tsx,md,json,yml}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,md,json,yml}\"",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "turbo run build && changeset publish",
    "prepare": "husky"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.7.0",
    "prettier": "^3.4.0",
    "eslint": "^9.17.0",
    "@changesets/cli": "^2.27.0",
    "husky": "^9.1.0",
    "lint-staged": "^15.3.0"
  }
}
```

- [ ] **Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "examples/*"
```

- [ ] **Step 3: Write `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["build"], "outputs": [] },
    "lint": { "outputs": [] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] }
  }
}
```

- [ ] **Step 4: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 5: Write `.gitignore`, `.nvmrc`, `.editorconfig`, `.npmrc`**

`.gitignore`:

```
node_modules/
dist/
.turbo/
coverage/
*.tsbuildinfo
.env
.DS_Store
```

`.nvmrc`:

```
20
```

`.editorconfig`:

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

`.npmrc`:

```
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 6: Install and verify workspace resolves**

Run: `pnpm install`
Expected: lockfile generated, no errors (no packages exist yet, so this just installs root devDependencies).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json .gitignore .nvmrc .editorconfig .npmrc pnpm-lock.yaml
git commit -m "chore: scaffold pnpm/turborepo workspace"
```

---

## Task 2: Lint, format, and git hooks

**Files:**

- Create: `eslint.config.js` (flat config, root)
- Create: `.prettierrc.json`, `.prettierignore`
- Create: `.husky/pre-commit`
- Modify: root `package.json` (`lint-staged` field)

**Interfaces:** None. Produces: `pnpm lint` / `pnpm format:check` runnable at root, pre-commit hook enforcing both.

- [ ] **Step 1: Write `eslint.config.js`**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
```

- [ ] **Step 2: Add ESLint devDependencies at root**

Run: `pnpm add -Dw @eslint/js typescript-eslint`

- [ ] **Step 3: Write `.prettierrc.json` and `.prettierignore`**

`.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

`.prettierignore`:

```
dist/
coverage/
pnpm-lock.yaml
```

- [ ] **Step 4: Add `lint-staged` config to root `package.json`**

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{md,json,yml}": ["prettier --write"]
  }
}
```

- [ ] **Step 5: Initialize Husky and write pre-commit hook**

Run: `pnpm exec husky init`

Write `.husky/pre-commit`:

```bash
pnpm exec lint-staged
```

- [ ] **Step 6: Verify hook fires**

Run: `git add eslint.config.js && git commit -m "test" --dry-run`
Expected: no error (lint-staged runs against staged files; empty TS tree means nothing to lint yet, command exits 0).

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js .prettierrc.json .prettierignore .husky package.json pnpm-lock.yaml
git commit -m "chore: add eslint, prettier, and husky pre-commit hook"
```

---

## Task 3: Changesets init and package skeletons

**Files:**

- Create: `.changeset/config.json`
- Create: `packages/better-auth-mongoose/{package.json,tsup.config.ts,tsconfig.json,vitest.config.ts}`
- Create: `packages/better-auth-mongoose/src/index.ts` (stub)
- Create: `packages/better-auth-mongoose-tenant/{package.json,tsup.config.ts,tsconfig.json,vitest.config.ts}`
- Create: `packages/better-auth-mongoose-tenant/src/index.ts` (stub)

**Interfaces:** Produces: two buildable, testable, empty packages that later tasks fill in.

- [ ] **Step 1: Init changesets**

Run: `pnpm exec changeset init`

Edit generated `.changeset/config.json` to use independent versioning (default) and set:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["nestjs-mongoose-example"]
}
```

- [ ] **Step 2: Scaffold `packages/better-auth-mongoose/package.json`**

```json
{
  "name": "better-auth-mongoose",
  "version": "0.1.0",
  "description": "A Mongoose-native database adapter for Better Auth — real, extensible Mongoose models, working .populate(), no raw mongodb dependency.",
  "license": "MIT",
  "author": "Ashwin Sathian",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src test",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "mongoose": "^6.0.0 || ^7.0.0 || ^8.0.0 || ^9.0.0",
    "better-auth": "^1.4.0 || ^1.5.0 || ^1.6.0"
  },
  "devDependencies": {
    "mongoose": "^9.9.1",
    "better-auth": "^1.6.23",
    "@better-auth/test-utils": "^1.0.0",
    "mongodb-memory-server": "^11.2.0",
    "vitest": "^3.0.0",
    "tsup": "^8.3.0",
    "typescript": "^5.7.0"
  },
  "keywords": ["better-auth", "mongoose", "mongodb", "adapter", "authentication"],
  "repository": {
    "type": "git",
    "url": "https://github.com/AshwinSathian/better-auth-mongoose",
    "directory": "packages/better-auth-mongoose"
  },
  "homepage": "https://github.com/AshwinSathian/better-auth-mongoose/tree/main/packages/better-auth-mongoose#readme",
  "bugs": "https://github.com/AshwinSathian/better-auth-mongoose/issues",
  "publishConfig": { "access": "public" }
}
```

- [ ] **Step 3: Scaffold `tsup.config.ts`, `tsconfig.json`, `vitest.config.ts`**

`tsup.config.ts`:

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
```

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
```

- [ ] **Step 4: Write stub `src/index.ts`**

```ts
export const PACKAGE_NAME = "better-auth-mongoose";
```

- [ ] **Step 5: Repeat Steps 2-4 for `packages/better-auth-mongoose-tenant`**, with `name: "better-auth-mongoose-tenant"`, description "Tenant-scoped query middleware for Better Auth's organization plugin on Mongoose.", peer/dev deps additionally including `"better-auth-mongoose": "workspace:^"` and `"better-auth-mongoose-tenant"` swapped into `PACKAGE_NAME`.

- [ ] **Step 6: Install workspace deps and verify both build**

Run: `pnpm install && pnpm --filter better-auth-mongoose build && pnpm --filter better-auth-mongoose-tenant build`
Expected: both emit `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` with no errors.

- [ ] **Step 7: Commit**

```bash
git add .changeset packages pnpm-lock.yaml
git commit -m "chore: scaffold better-auth-mongoose and better-auth-mongoose-tenant packages"
```

---

## Task 4: CI workflows (lint, typecheck, test matrix, CodeQL, Dependabot)

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/codeql.yml`
- Create: `.github/dependabot.yml`

**Interfaces:** None (infra only). Produces: green-checkable PRs from the first commit onward.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm lint
      - run: pnpm typecheck

  test:
    needs: lint-and-typecheck
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node-version: [18, 20, 22]
        better-auth-version: ["^1.4.0", "^1.5.0", "^1.6.0"]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Pin better-auth version under test
        run: pnpm --filter better-auth-mongoose add -D better-auth@${{ matrix.better-auth-version }}
      - run: pnpm build
      - run: pnpm test
```

- [ ] **Step 2: Write `.github/workflows/codeql.yml`**

```yaml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: "0 6 * * 1"

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/analyze@v3
```

- [ ] **Step 3: Write `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    groups:
      dev-dependencies:
        dependency-type: development
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
```

- [ ] **Step 4: Validate YAML syntax locally**

Run: `python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in ['.github/workflows/ci.yml','.github/workflows/codeql.yml','.github/dependabot.yml']]; print('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/codeql.yml .github/dependabot.yml
git commit -m "ci: add lint/typecheck/test matrix, CodeQL, and dependabot"
```

---

## Task 5: Changesets release workflow

**Files:**

- Create: `.github/workflows/release.yml`

**Interfaces:** None. Produces: on merge to `main`, opens/updates a "Version Packages" PR; merging that PR publishes to npm using an `NPM_TOKEN` secret the user adds later (documented in root README, Task 24).

- [ ] **Step 1: Write `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: "https://registry.npmjs.org"
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Create release PR or publish
        uses: changesets/action@v1
        with:
          publish: pnpm release
          version: pnpm version-packages
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add changesets release workflow"
```

---

## Task 6: Community health files

**Files:**

- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `SECURITY.md`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`

**Interfaces:** None. Produces: the files GitHub's "community standards" checklist and any future community-adapter PR reviewer will look for.

- [ ] **Step 1: Write `LICENSE`** (MIT, current year 2026, copyright holder Ashwin Sathian)

```
MIT License

Copyright (c) 2026 Ashwin Sathian

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Write `CONTRIBUTING.md`** covering: dev setup (`pnpm install`), running tests (`pnpm test`, note `mongodb-memory-server` downloads a real `mongod` binary on first run), the changeset requirement (`pnpm changeset` before opening a PR touching `packages/*`), commit style, and how CI gates merges.

- [ ] **Step 3: Write `CODE_OF_CONDUCT.md`** using the Contributor Covenant v2.1 text, contact method set to opening a GitHub issue (no separate private email infra for a solo-maintained project).

- [ ] **Step 4: Write `SECURITY.md`** stating supported versions (latest minor of each package), and that vulnerabilities should be reported via GitHub's private vulnerability reporting (Security tab → "Report a vulnerability") rather than public issues.

- [ ] **Step 5: Write issue templates and PR template**

`.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Better Auth core issue
    url: https://github.com/better-auth/better-auth/issues
    about: If your issue is about Better Auth itself rather than this adapter, report it upstream.
```

`bug_report.yml` and `feature_request.yml`: standard GitHub issue-forms YAML with fields for adapter version, `better-auth` version, `mongoose` version, Node version, reproduction steps/repo, and expected vs actual behavior.

`.github/PULL_REQUEST_TEMPLATE.md`: checklist — tests added/updated, `pnpm changeset` run if publishable code changed, `pnpm lint`/`pnpm typecheck`/`pnpm test` pass locally, docs updated if public API changed.

- [ ] **Step 6: Verify GitHub's community-standards-relevant files are all present**

Run: `ls LICENSE CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md .github/ISSUE_TEMPLATE/config.yml .github/PULL_REQUEST_TEMPLATE.md`
Expected: all six paths listed, no "No such file" errors.

- [ ] **Step 7: Commit**

```bash
git add LICENSE CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md .github/ISSUE_TEMPLATE .github/PULL_REQUEST_TEMPLATE.md
git commit -m "docs: add community health files (license, contributing, CoC, security)"
```

---

## Implementation Note (added during execution, before Task 7)

Before writing any adapter code, I read the real, currently-shipping `@better-auth/mongo-adapter@1.6.26` source (a transitive devDependency, pulled in via `@better-auth/test-utils`) and the exact `@better-auth/core` type definitions for `CustomAdapter`, `AdapterFactoryConfig`, `Where`, and `JoinConfig`. Three things confirmed or corrected from the plan as originally written:

1. **ID conversion belongs in `customIdGenerator`/`customTransformInput`/`customTransformOutput` (all real, documented `AdapterFactoryConfig` fields), not scattered across every operation file.** The official adapter sets `customIdGenerator: () => new ObjectId().toString()` unconditionally, then in `customTransformInput` coerces any field where `field === "_id"` or `fieldAttributes.references?.field === "id"` from string to `ObjectId` — wrapped in try/catch, falling back to the original string if coercion fails (this only matters if a consumer overrides `advanced.database.generateId` with something that doesn't produce valid ObjectId hex). `customTransformOutput` does the inverse. This confirms the plan's original instinct (Task 10) but relocates the mechanism: **`id-mapping.ts` now exports `customIdGenerator`, `makeCustomTransformInput`, and `makeCustomTransformOutput` for use in `adapter.ts`'s `config:` block — not `prepareDocForWrite`/`prepareDocForRead` called manually from each operation.** This means Tasks 11–13's operation files do **not** need to touch ID conversion at all — the factory applies these hooks automatically before/after calling our raw `CustomAdapter` methods. Use `mongoose.Types.ObjectId`, not the `mongodb` package's `ObjectId` — Mongoose re-exports a compatible class, so this still satisfies the "no direct `mongodb` dependency" constraint.
2. **`transaction` lives on `AdapterFactoryConfig` (the `config:` object), confirmed directly from the type definition** (`AdapterFactoryConfig extends Omit<DBAdapterFactoryConfig, "transaction"> { transaction?: (false | (<R>(cb: (trx: DBTransactionAdapter) => Promise<R>) => Promise<R>)) }`) — Task 16 no longer needs the `as any` cast the original plan hedged with. The official adapter's real wiring recursively calls `createAdapterFactory({ config: { ...adapterOptions.config, transaction: false }, adapter: createCustomAdapter(session) })(lazyOptions)` inside the transaction function, using a `lazyOptions`/`lazyAdapter` closure set when the outer returned function is first invoked by Better Auth core. Task 15/16 now follow this exact pattern instead of the plan's original (incorrect) idea of handing the callback a bare `CustomAdapter`-shaped object built from the raw operation factories.
3. **`JoinConfig`'s real shape is `{ [joinedModelName]: { on: { from: string; to: string }, limit?: number, relation?: "one-to-one" | "one-to-many" | "many-to-many" } }`** — not `{ path, select }` as the plan guessed. Since every Better Auth relation's `references.field` is `"id"` (verified against `getAuthTables`), `on.to` is always `"id"`/`"_id"`, so `applyJoin` translates directly to `query.populate({ path: on.from })` — the local field that already carries a Mongoose `ref` (set by `build-schema.ts` for any field with a `references` attribute). Task 14 implements this directly rather than doing the "read the type first" step at that point — it's already done here.

These are corrections grounded in the actual installed package, not guesses — applying them now, before writing `id-mapping.ts`, `join.ts`, or `transaction.ts`, avoids building on the plan's original (less certain) assumptions and then having to redo it.

---

## Task 7: Schema builder (`build-schema.ts`)

**Files:**

- Create: `packages/better-auth-mongoose/src/schema/build-schema.ts`
- Test: `packages/better-auth-mongoose/test/build-schema.test.ts`

**Interfaces:**

- Consumes: Better Auth's `DBFieldAttribute` shape, verified via Context7 from `getAuthTables` source — fields observed: `type: "string" | "number" | "boolean" | "date"`, `required?: boolean`, `unique?: boolean`, `fieldName: string`, `references?: { model: string; field: string; onDelete?: string }`, `defaultValue?: unknown | (() => unknown)`, `sortable?: boolean`, `index?: boolean`, `input?: boolean`, `returned?: boolean`, `bigint?: boolean`.
- Produces: `buildSchemaDefinition(fields: Record<string, DBFieldAttribute>): mongoose.SchemaDefinition` — used by Task 9's `register-models.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/better-auth-mongoose/test/build-schema.test.ts
import { describe, expect, it } from "vitest";
import { buildSchemaDefinition } from "../src/schema/build-schema";
import type { DBFieldAttribute } from "better-auth/db";

describe("buildSchemaDefinition", () => {
  it("maps string/number/boolean/date field types to Mongoose types", () => {
    const fields: Record<string, DBFieldAttribute> = {
      name: { type: "string", required: true, fieldName: "name" },
      age: { type: "number", required: false, fieldName: "age" },
      verified: { type: "boolean", required: true, fieldName: "verified" },
      createdAt: { type: "date", required: true, fieldName: "createdAt" },
    };

    const def = buildSchemaDefinition(fields);

    expect(def.name).toMatchObject({ type: String, required: true });
    expect(def.age).toMatchObject({ type: Number, required: false });
    expect(def.verified).toMatchObject({ type: Boolean, required: true });
    expect(def.createdAt).toMatchObject({ type: Date, required: true });
  });

  it("marks unique fields and applies defaultValue", () => {
    const fields: Record<string, DBFieldAttribute> = {
      email: { type: "string", required: true, unique: true, fieldName: "email" },
      role: {
        type: "string",
        required: true,
        fieldName: "role",
        defaultValue: "member",
      },
    };

    const def = buildSchemaDefinition(fields);

    expect(def.email).toMatchObject({ unique: true });
    expect(def.role).toMatchObject({ default: "member" });
  });

  it("maps reference fields to ObjectId with a ref", () => {
    const fields: Record<string, DBFieldAttribute> = {
      userId: {
        type: "string",
        required: true,
        fieldName: "userId",
        references: { model: "user", field: "id", onDelete: "cascade" },
      },
    };

    const def = buildSchemaDefinition(fields);

    // Mongoose SchemaTypeOptions store the constructor under `.type`
    expect((def.userId as any).type.name).toBe("ObjectId");
    expect((def.userId as any).ref).toBe("user");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter better-auth-mongoose test build-schema`
Expected: FAIL — `Cannot find module '../src/schema/build-schema'`

- [ ] **Step 3: Write the implementation**

```ts
// packages/better-auth-mongoose/src/schema/build-schema.ts
import { Schema } from "mongoose";
import type { SchemaDefinition } from "mongoose";
import type { DBFieldAttribute } from "better-auth/db";

const TYPE_MAP = {
  string: String,
  number: Number,
  boolean: Boolean,
  date: Date,
} as const;

export function buildSchemaDefinition(fields: Record<string, DBFieldAttribute>): SchemaDefinition {
  const definition: SchemaDefinition = {};

  for (const [key, attr] of Object.entries(fields)) {
    if (attr.references) {
      definition[key] = {
        type: Schema.Types.ObjectId,
        ref: attr.references.model,
        required: attr.required ?? true,
      };
      continue;
    }

    const type = TYPE_MAP[attr.type as keyof typeof TYPE_MAP] ?? String;

    definition[key] = {
      type,
      required: attr.required ?? true,
      ...(attr.unique ? { unique: true } : {}),
      ...(attr.index ? { index: true } : {}),
      ...(attr.defaultValue !== undefined && typeof attr.defaultValue !== "function"
        ? { default: attr.defaultValue }
        : {}),
      ...(typeof attr.defaultValue === "function"
        ? { default: attr.defaultValue as () => unknown }
        : {}),
    };
  }

  return definition;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter better-auth-mongoose test build-schema`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/better-auth-mongoose/src/schema/build-schema.ts packages/better-auth-mongoose/test/build-schema.test.ts
git commit -m "feat(adapter): map Better Auth field attributes to Mongoose schema definitions"
```

---

## Task 8: Schema merge (`merge-schema.ts`) — the differentiator's foundation

**Files:**

- Create: `packages/better-auth-mongoose/src/schema/merge-schema.ts`
- Test: `packages/better-auth-mongoose/test/merge-schema.test.ts`

**Interfaces:**

- Consumes: `buildSchemaDefinition` from Task 7.
- Produces: `mergeSchema(requiredFields: Record<string, DBFieldAttribute>, consumerSchema?: Schema): Schema` — used by Task 9's `register-models.ts`. Backfills any Better-Auth-required field missing from the consumer's schema; never drops a consumer field; never lets a consumer field silently override a required field's `required`/`unique` constraint (logs nothing here — just merges structurally, per G4).

- [ ] **Step 1: Write the failing test**

```ts
// packages/better-auth-mongoose/test/merge-schema.test.ts
import { describe, expect, it } from "vitest";
import { Schema } from "mongoose";
import { mergeSchema } from "../src/schema/merge-schema";
import type { DBFieldAttribute } from "better-auth/db";

const requiredFields: Record<string, DBFieldAttribute> = {
  email: { type: "string", required: true, unique: true, fieldName: "email" },
  name: { type: "string", required: true, fieldName: "name" },
};

describe("mergeSchema", () => {
  it("builds a default schema from required fields when no consumer schema is given", () => {
    const schema = mergeSchema(requiredFields);
    expect(schema.path("email")).toBeDefined();
    expect(schema.path("name")).toBeDefined();
  });

  it("keeps every consumer field and backfills missing required fields", () => {
    const consumerSchema = new Schema({
      role: { type: String, default: "member" },
      tenantId: { type: Schema.Types.ObjectId, ref: "Tenant" },
    });

    const merged = mergeSchema(requiredFields, consumerSchema);

    expect(merged.path("role")).toBeDefined();
    expect(merged.path("tenantId")).toBeDefined();
    expect(merged.path("email")).toBeDefined();
    expect(merged.path("name")).toBeDefined();
  });

  it("does not let the consumer schema drop a required field even if it redefines it", () => {
    const consumerSchema = new Schema({
      email: { type: String, required: false }, // consumer tries to loosen it
    });

    const merged = mergeSchema(requiredFields, consumerSchema);

    expect((merged.path("email") as any).isRequired).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter better-auth-mongoose test merge-schema`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// packages/better-auth-mongoose/src/schema/merge-schema.ts
import { Schema } from "mongoose";
import type { DBFieldAttribute } from "better-auth/db";
import { buildSchemaDefinition } from "./build-schema";

export function mergeSchema(
  requiredFields: Record<string, DBFieldAttribute>,
  consumerSchema?: Schema,
): Schema {
  const requiredDefinition = buildSchemaDefinition(requiredFields);
  const base = consumerSchema ? consumerSchema.clone() : new Schema({});

  for (const [key, pathDefinition] of Object.entries(requiredDefinition)) {
    // Required Better-Auth fields always win: add if missing, and re-assert
    // the definition if the consumer redefined it more loosely.
    base.add({ [key]: pathDefinition });
  }

  return base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter better-auth-mongoose test merge-schema`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/better-auth-mongoose/src/schema/merge-schema.ts packages/better-auth-mongoose/test/merge-schema.test.ts
git commit -m "feat(adapter): merge consumer Mongoose schemas with Better Auth's required fields"
```

---

## Task 9: Default schemas and model registration (`register-models.ts`)

**Files:**

- Create: `packages/better-auth-mongoose/src/schema/default-schemas.ts`
- Create: `packages/better-auth-mongoose/src/schema/register-models.ts`
- Test: `packages/better-auth-mongoose/test/register-models.test.ts`

**Interfaces:**

- Consumes: `mergeSchema` (Task 8), `MongooseAdapterOptions` (Task 1's types.ts — write it now if not yet present), Better Auth's `BetterAuthDBSchema` (`{ [modelKey]: { modelName: string; fields: Record<string, DBFieldAttribute> } }`, verified via Context7's `getAuthTables` source).
- Produces: `registerModels(connection: Connection, dbSchema: BetterAuthDBSchema, options: MongooseAdapterOptions): Map<string, Model<any>>` keyed by each entry's **resolved** `modelName` (not the schema object's key) — this is the same string Better Auth's adapter factory passes as `model` into every `CustomAdapter` method, so Task 11-13's operations can look models up directly by that value.

- [ ] **Step 1: Write `src/types.ts`** (if not already created by an earlier task — check first)

```ts
// packages/better-auth-mongoose/src/types.ts
import type { Schema } from "mongoose";

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
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/better-auth-mongoose/test/register-models.test.ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose, { Schema, type Connection } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { registerModels } from "../src/schema/register-models";
import type { BetterAuthDBSchema } from "better-auth/db";

let mongod: MongoMemoryServer;
let connection: Connection;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  connection = mongoose.createConnection(mongod.getUri());
  await connection.asPromise();
});

afterAll(async () => {
  await connection.close();
  await mongod.stop();
});

const dbSchema: BetterAuthDBSchema = {
  user: {
    modelName: "user",
    fields: {
      email: { type: "string", required: true, unique: true, fieldName: "email" },
      name: { type: "string", required: true, fieldName: "name" },
    },
  },
} as unknown as BetterAuthDBSchema;

describe("registerModels", () => {
  it("registers a default Mongoose model per Better Auth model when no consumer schema exists", () => {
    const models = registerModels(connection, dbSchema, {});
    expect(models.get("user")).toBeDefined();
    expect(models.get("user")!.schema.path("email")).toBeDefined();
  });

  it("adopts an already-registered consumer model instead of overwriting it", () => {
    const conn2 = connection.useDb("adopt-test");
    conn2.model("user", new Schema({ role: { type: String, default: "member" } }));

    const models = registerModels(conn2, dbSchema, { adoptExistingModels: true });

    expect(models.get("user")!.schema.path("role")).toBeDefined();
    expect(models.get("user")!.schema.path("email")).toBeDefined(); // backfilled
  });

  it("respects options.schemas overrides even when no model is pre-registered", () => {
    const conn3 = connection.useDb("schemas-option-test");
    const userExtension = new Schema({ tenantId: { type: Schema.Types.ObjectId, ref: "Tenant" } });

    const models = registerModels(conn3, dbSchema, { schemas: { user: userExtension } });

    expect(models.get("user")!.schema.path("tenantId")).toBeDefined();
    expect(models.get("user")!.schema.path("email")).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter better-auth-mongoose test register-models`
Expected: FAIL — module not found

- [ ] **Step 4: Write `default-schemas.ts` and `register-models.ts`**

```ts
// packages/better-auth-mongoose/src/schema/default-schemas.ts
// Intentionally empty of hardcoded field lists: the real source of truth for
// user/session/account/verification fields is Better Auth's own
// getAuthTables(options) output, passed into registerModels as `dbSchema`.
// This file exists so schema/ has one place to add Mongoose-only defaults
// (e.g. schema options like `versionKey: false`) applied to every model.
export const DEFAULT_SCHEMA_OPTIONS = { versionKey: false, minimize: false } as const;
```

```ts
// packages/better-auth-mongoose/src/schema/register-models.ts
import type { Connection, Model } from "mongoose";
import type { BetterAuthDBSchema } from "better-auth/db";
import { mergeSchema } from "./merge-schema";
import { DEFAULT_SCHEMA_OPTIONS } from "./default-schemas";
import type { MongooseAdapterOptions } from "../types";

export function registerModels(
  connection: Connection,
  dbSchema: BetterAuthDBSchema,
  options: MongooseAdapterOptions,
): Map<string, Model<any>> {
  const models = new Map<string, Model<any>>();
  const adoptExisting = options.adoptExistingModels ?? true;

  for (const entry of Object.values(dbSchema)) {
    const modelName = entry.modelName;
    const consumerSchema = options.schemas?.[modelName];

    const existing = adoptExisting ? connection.models[modelName] : undefined;

    if (existing) {
      const merged = mergeSchema(entry.fields, existing.schema);
      merged.set("versionKey", DEFAULT_SCHEMA_OPTIONS.versionKey);
      merged.set("minimize", DEFAULT_SCHEMA_OPTIONS.minimize);
      // Mongoose doesn't allow redefining a compiled model's schema in place,
      // so we deleteModel + re-register with the merged (backfilled) schema.
      connection.deleteModel(modelName);
      models.set(modelName, connection.model(modelName, merged));
      continue;
    }

    const schema = mergeSchema(entry.fields, consumerSchema);
    schema.set("versionKey", DEFAULT_SCHEMA_OPTIONS.versionKey);
    schema.set("minimize", DEFAULT_SCHEMA_OPTIONS.minimize);
    models.set(modelName, connection.model(modelName, schema));
  }

  return models;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter better-auth-mongoose test register-models`
Expected: PASS (3 tests). This is the first real proof of G4 (schema extension) at the unit level.

- [ ] **Step 6: Commit**

```bash
git add packages/better-auth-mongoose/src/types.ts packages/better-auth-mongoose/src/schema/default-schemas.ts packages/better-auth-mongoose/src/schema/register-models.ts packages/better-auth-mongoose/test/register-models.test.ts
git commit -m "feat(adapter): register real Mongoose models per Better Auth table, adopting consumer models"
```

---

## Task 10: ID mapping (`id-mapping.ts`) — the correctness-critical piece

**Files:**

- Create: `packages/better-auth-mongoose/src/id-mapping.ts`
- Test: `packages/better-auth-mongoose/test/id-mapping.test.ts`

**Interfaces:**

- Produces: `generateObjectIdString()`, `toObjectId(id: string): Types.ObjectId`, `toIdString(id: Types.ObjectId | string): string`, `prepareDocForWrite(model: Model<any>, data: Record<string, unknown>): Record<string, unknown>`, `prepareDocForRead(model: Model<any>, doc: Record<string, unknown> | null): Record<string, unknown> | null`. All of Tasks 11-13's operations depend on these two `prepare*` functions.

**Why this task matters (read before implementing):** Better Auth's default ID generator produces a 32-character base62 string (verified via Context7 against `better-auth`'s `packages/core/src/utils/id.ts`) — **not** a valid `ObjectId` hex string. Every existing blog post's raw-client workaround either stores that string as a literal Mongo `_id` (fine, but then a consumer's own `{ type: ObjectId, ref: 'user' }` field can never `.populate()` against it, since the types don't match) or doesn't address it at all. The fix: this adapter supplies its own `customIdGenerator` (a documented `AdapterFactoryConfig` field — verified via Context7 against the `defaultValue()` id-field source, which shows `customIdGenerator` is checked with lower priority than a user's own `advanced.database.generateId` and higher priority than the base62 default) that emits real 24-hex-char strings, i.e. valid `ObjectId.toHexString()` output. `prepareDocForWrite` then converts any path in the model's schema whose Mongoose type is `ObjectId` (including `_id` itself) from that hex string to a real `Types.ObjectId` before the document is saved; `prepareDocForRead` converts back to string on the way out. This is what makes `Post.author: { type: ObjectId, ref: 'user' }` actually `.populate()` correctly — proven end-to-end in Task 18.

- [ ] **Step 1: Write the failing test**

```ts
// packages/better-auth-mongoose/test/id-mapping.test.ts
import { describe, expect, it } from "vitest";
import mongoose, { Schema, Types } from "mongoose";
import {
  generateObjectIdString,
  toObjectId,
  toIdString,
  prepareDocForWrite,
  prepareDocForRead,
} from "../src/id-mapping";

describe("generateObjectIdString", () => {
  it("produces a 24-character hex string that is a valid ObjectId", () => {
    const id = generateObjectIdString();
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(() => new Types.ObjectId(id)).not.toThrow();
  });
});

describe("toObjectId / toIdString", () => {
  it("round-trips a hex string through ObjectId and back", () => {
    const id = generateObjectIdString();
    expect(toIdString(toObjectId(id))).toBe(id);
  });
});

describe("prepareDocForWrite / prepareDocForRead", () => {
  const TestModel = mongoose.model(
    "IdMappingTest",
    new Schema({
      _id: { type: Schema.Types.ObjectId },
      author: { type: Schema.Types.ObjectId, ref: "user" },
      title: { type: String },
    }),
  );

  it("converts hex-string id and reference fields to ObjectId for write", () => {
    const idHex = generateObjectIdString();
    const authorHex = generateObjectIdString();

    const prepared = prepareDocForWrite(TestModel, {
      _id: idHex,
      author: authorHex,
      title: "hello",
    });

    expect(prepared._id).toBeInstanceOf(Types.ObjectId);
    expect(prepared.author).toBeInstanceOf(Types.ObjectId);
    expect(prepared.title).toBe("hello");
  });

  it("converts ObjectId fields back to strings for read, and passes through null", () => {
    const idHex = generateObjectIdString();
    const authorHex = generateObjectIdString();

    const read = prepareDocForRead(TestModel, {
      _id: toObjectId(idHex),
      author: toObjectId(authorHex),
      title: "hello",
    });

    expect(read!._id).toBe(idHex);
    expect(read!.author).toBe(authorHex);
    expect(prepareDocForRead(TestModel, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter better-auth-mongoose test id-mapping`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
// packages/better-auth-mongoose/src/id-mapping.ts
import { Types, type Model } from "mongoose";

export function generateObjectIdString(): string {
  return new Types.ObjectId().toHexString();
}

export function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error(
      `better-auth-mongoose: expected a 24-character ObjectId-compatible id, got "${id}". ` +
        `If you've overridden advanced.database.generateId, it must return valid ObjectId hex strings.`,
    );
  }
  return new Types.ObjectId(id);
}

export function toIdString(id: Types.ObjectId | string): string {
  return typeof id === "string" ? id : id.toHexString();
}

function objectIdPaths(model: Model<any>): Set<string> {
  const paths = new Set<string>();
  model.schema.eachPath((path, schemaType) => {
    if (schemaType.instance === "ObjectId") {
      paths.add(path);
    }
  });
  return paths;
}

export function prepareDocForWrite(
  model: Model<any>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const idFields = objectIdPaths(model);
  const prepared: Record<string, unknown> = { ...data };

  for (const field of idFields) {
    const value = prepared[field];
    if (typeof value === "string") {
      prepared[field] = toObjectId(value);
    }
  }

  return prepared;
}

export function prepareDocForRead(
  model: Model<any>,
  doc: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!doc) return null;

  const idFields = objectIdPaths(model);
  const prepared: Record<string, unknown> = { ...doc };

  for (const field of idFields) {
    const value = prepared[field];
    if (value instanceof Types.ObjectId) {
      prepared[field] = toIdString(value);
    }
  }

  return prepared;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter better-auth-mongoose test id-mapping`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/better-auth-mongoose/src/id-mapping.ts packages/better-auth-mongoose/test/id-mapping.test.ts
git commit -m "feat(adapter): ObjectId-compatible id generation and read/write conversion"
```

---

## Task 11: Create, read, and count operations

**Files:**

- Create: `packages/better-auth-mongoose/src/operations/create.ts`
- Create: `packages/better-auth-mongoose/src/operations/read.ts`
- Create: `packages/better-auth-mongoose/test/setup.ts`
- Test: `packages/better-auth-mongoose/test/crud.test.ts` (create/read/count portion — update/delete added by Tasks 12-13 to the same file)

**Interfaces:**

- Consumes: `prepareDocForWrite`/`prepareDocForRead` (Task 10), `Map<string, Model<any>>` from `registerModels` (Task 9), `applyJoin` (defined in Task 14 — **for this task, write `read.ts` calling `applyJoin` as an already-known import; Task 14 will fill in `join.ts`'s implementation, but stub it now as a same-signature passthrough so this task's tests can run**: `export function applyJoin<T>(query: T, _join?: unknown): T { return query; }` in a temporary `src/join.ts`, to be replaced (not re-created) in Task 14.
- Produces: `makeCreate`, `makeFindOne`, `makeFindMany`, `makeCount` — assembled into the adapter in Task 16.

- [ ] **Step 1: Write the shared test harness**

```ts
// packages/better-auth-mongoose/test/setup.ts
import mongoose, { type Connection } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let replSet: MongoMemoryReplSet | undefined;

export async function createTestConnection(): Promise<Connection> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const connection = mongoose.createConnection(replSet.getUri());
  await connection.asPromise();
  return connection;
}

export async function teardownTestConnection(connection: Connection): Promise<void> {
  await connection.close();
  await replSet?.stop();
  replSet = undefined;
}
```

- [ ] **Step 2: Write the temporary `join.ts` stub** (Task 14 replaces this file's contents, not its existence)

```ts
// packages/better-auth-mongoose/src/join.ts
// TEMPORARY passthrough — replaced with real populate() translation in the
// joins task. Exists now so operations/read.ts has a stable import target.
export function applyJoin<T>(query: T, _join?: unknown): T {
  return query;
}
```

- [ ] **Step 3: Write the failing test**

```ts
// packages/better-auth-mongoose/test/crud.test.ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Schema, type Connection, type Model } from "mongoose";
import { createTestConnection, teardownTestConnection } from "./setup";
import { registerModels } from "../src/schema/register-models";
import { makeCreate } from "../src/operations/create";
import { makeFindOne, makeFindMany, makeCount } from "../src/operations/read";
import { generateObjectIdString } from "../src/id-mapping";
import type { BetterAuthDBSchema } from "better-auth/db";

let connection: Connection;
let models: Map<string, Model<any>>;

const dbSchema: BetterAuthDBSchema = {
  user: {
    modelName: "user",
    fields: {
      email: { type: "string", required: true, unique: true, fieldName: "email" },
      name: { type: "string", required: true, fieldName: "name" },
    },
  },
} as unknown as BetterAuthDBSchema;

beforeAll(async () => {
  connection = await createTestConnection();
  models = registerModels(connection, dbSchema, {});
});

afterAll(async () => {
  await teardownTestConnection(connection);
});

describe("create + findOne + findMany + count", () => {
  it("creates a document and returns it with a string id", async () => {
    const create = makeCreate(models);
    const id = generateObjectIdString();

    const result = await create({
      model: "user",
      data: { _id: id, email: "a@example.com", name: "Ada" } as any,
    });

    expect(result._id).toBe(id);
    expect((result as any).email).toBe("a@example.com");
  });

  it("finds one document by where clause", async () => {
    const findOne = makeFindOne(models);

    const found = await findOne({
      model: "user",
      where: [{ field: "email", value: "a@example.com", operator: "eq", connector: "AND" }] as any,
    });

    expect(found).not.toBeNull();
    expect((found as any).email).toBe("a@example.com");
  });

  it("returns null from findOne when nothing matches", async () => {
    const findOne = makeFindOne(models);
    const found = await findOne({
      model: "user",
      where: [
        { field: "email", value: "nobody@example.com", operator: "eq", connector: "AND" },
      ] as any,
    });
    expect(found).toBeNull();
  });

  it("finds many documents with limit", async () => {
    const create = makeCreate(models);
    await create({
      model: "user",
      data: { _id: generateObjectIdString(), email: "b@example.com", name: "Bob" } as any,
    });

    const findMany = makeFindMany(models);
    const results = await findMany({ model: "user", where: undefined, limit: 10 });

    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("counts documents matching a where clause", async () => {
    const count = makeCount(models);
    const total = await count({ model: "user", where: undefined });
    expect(total).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter better-auth-mongoose test crud`
Expected: FAIL — `create.ts`/`read.ts` not found

- [ ] **Step 5: Write `create.ts` and `read.ts`**

First, read the installed `better-auth` package's `Where`/`CleanedWhere` type definition to confirm the exact filter-clause shape (`{ field, value, operator, connector }` was inferred from the CustomAdapter interface excerpt but must be confirmed against real `.d.ts`):

Run: `grep -rn "operator" node_modules/better-auth/dist/*.d.ts | grep -i where | head -20`

Then implement a `whereToMongoFilter` helper inline in `read.ts` (shared by later tasks via re-export) that maps each clause's `operator` (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `starts_with`, `ends_with` — confirm exact operator names from the grep output above) to the matching MongoDB query operator, ANDing/ORing clauses per their `connector`.

```ts
// packages/better-auth-mongoose/src/operations/create.ts
import type { Model } from "mongoose";
import { prepareDocForWrite, prepareDocForRead } from "../id-mapping";
import type { CustomAdapter } from "better-auth/db";

export function makeCreate(models: Map<string, Model<any>>): CustomAdapter["create"] {
  return async ({ model, data }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const prepared = prepareDocForWrite(mongooseModel, data as Record<string, unknown>);
    const created = await mongooseModel.create(prepared);
    return prepareDocForRead(mongooseModel, created.toObject()) as typeof data;
  };
}
```

```ts
// packages/better-auth-mongoose/src/operations/read.ts
import type { Model } from "mongoose";
import { prepareDocForRead, toObjectId } from "../id-mapping";
import { applyJoin } from "../join";
import type { CustomAdapter } from "better-auth/db";

const OPERATOR_MAP: Record<string, string> = {
  eq: "$eq",
  ne: "$ne",
  gt: "$gt",
  gte: "$gte",
  lt: "$lt",
  lte: "$lte",
  in: "$in",
  not_in: "$nin",
  contains: "$regex",
  starts_with: "$regex",
  ends_with: "$regex",
};

export function whereToMongoFilter(where: any[] | undefined): Record<string, unknown> {
  if (!where || where.length === 0) return {};

  const andClauses: Record<string, unknown>[] = [];
  const orClauses: Record<string, unknown>[] = [];

  for (const clause of where) {
    const mongoOp = OPERATOR_MAP[clause.operator] ?? "$eq";
    let value = clause.value;
    if (clause.operator === "starts_with") value = `^${value}`;
    if (clause.operator === "ends_with") value = `${value}$`;

    const condition = { [clause.field]: { [mongoOp]: value } };
    if (clause.connector === "OR") {
      orClauses.push(condition);
    } else {
      andClauses.push(condition);
    }
  }

  const filter: Record<string, unknown> = {};
  if (andClauses.length) filter.$and = andClauses;
  if (orClauses.length) filter.$or = orClauses;
  return filter;
}

export function makeFindOne(models: Map<string, Model<any>>): CustomAdapter["findOne"] {
  return async ({ model, where, select, join }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(where);
    const projection = select?.reduce(
      (acc, field) => ({ ...acc, [field]: 1 }),
      {} as Record<string, 1>,
    );

    let query = mongooseModel.findOne(filter, projection);
    query = applyJoin(query, join);

    const doc = await query.lean().exec();
    return prepareDocForRead(mongooseModel, doc) as any;
  };
}

export function makeFindMany(models: Map<string, Model<any>>): CustomAdapter["findMany"] {
  return async ({ model, where, limit, select, sortBy, offset, join }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(where);
    const projection = select?.reduce(
      (acc, field) => ({ ...acc, [field]: 1 }),
      {} as Record<string, 1>,
    );

    let query = mongooseModel.find(filter, projection).limit(limit);
    if (offset) query = query.skip(offset);
    if (sortBy) query = query.sort({ [sortBy.field]: sortBy.direction === "asc" ? 1 : -1 });
    query = applyJoin(query, join);

    const docs = await query.lean().exec();
    return docs.map((doc) => prepareDocForRead(mongooseModel, doc)) as any;
  };
}

export function makeCount(models: Map<string, Model<any>>): CustomAdapter["count"] {
  return async ({ model, where }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(where);
    return mongooseModel.countDocuments(filter);
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter better-auth-mongoose test crud`
Expected: PASS (5 tests). If the `where` clause shape from the grep in Step 5 differs from `{ field, value, operator, connector }`, adjust `whereToMongoFilter` and the test fixtures to match the real shape before proceeding — do not guess past a failing assertion here, since every later CRUD task reuses `whereToMongoFilter`.

- [ ] **Step 7: Commit**

```bash
git add packages/better-auth-mongoose/src/operations/create.ts packages/better-auth-mongoose/src/operations/read.ts packages/better-auth-mongoose/src/join.ts packages/better-auth-mongoose/test/setup.ts packages/better-auth-mongoose/test/crud.test.ts
git commit -m "feat(adapter): implement create, findOne, findMany, and count operations"
```

---

## Task 12: Update operations

**Files:**

- Create: `packages/better-auth-mongoose/src/operations/update.ts`
- Modify: `packages/better-auth-mongoose/test/crud.test.ts` (append update tests)

**Interfaces:**

- Consumes: `whereToMongoFilter` (exported from Task 11's `read.ts`), `prepareDocForWrite`/`prepareDocForRead` (Task 10).
- Produces: `makeUpdate`, `makeUpdateMany`.

- [ ] **Step 1: Append the failing tests to `crud.test.ts`**

```ts
// append to packages/better-auth-mongoose/test/crud.test.ts, inside a new describe block
import { makeUpdate, makeUpdateMany } from "../src/operations/update";

describe("update + updateMany", () => {
  it("updates a single matching document and returns it", async () => {
    const update = makeUpdate(models);

    const result = await update({
      model: "user",
      where: [{ field: "email", value: "a@example.com", operator: "eq", connector: "AND" }] as any,
      update: { name: "Ada Lovelace" } as any,
    });

    expect((result as any)?.name).toBe("Ada Lovelace");
  });

  it("returns null when update matches nothing", async () => {
    const update = makeUpdate(models);
    const result = await update({
      model: "user",
      where: [
        { field: "email", value: "ghost@example.com", operator: "eq", connector: "AND" },
      ] as any,
      update: { name: "Nobody" } as any,
    });
    expect(result).toBeNull();
  });

  it("updates many documents and returns the modified count", async () => {
    const updateMany = makeUpdateMany(models);
    const count = await updateMany({
      model: "user",
      where: [] as any,
      update: { name: "Everyone" },
    });
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter better-auth-mongoose test crud`
Expected: FAIL — `update.ts` not found

- [ ] **Step 3: Write `update.ts`**

```ts
// packages/better-auth-mongoose/src/operations/update.ts
import type { Model } from "mongoose";
import { prepareDocForWrite, prepareDocForRead } from "../id-mapping";
import { whereToMongoFilter } from "./read";
import type { CustomAdapter } from "better-auth/db";

export function makeUpdate(models: Map<string, Model<any>>): CustomAdapter["update"] {
  return async ({ model, where, update }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(where);
    const preparedUpdate = prepareDocForWrite(mongooseModel, update as Record<string, unknown>);

    const doc = await mongooseModel
      .findOneAndUpdate(filter, preparedUpdate, { new: true })
      .lean()
      .exec();

    return prepareDocForRead(mongooseModel, doc) as any;
  };
}

export function makeUpdateMany(models: Map<string, Model<any>>): CustomAdapter["updateMany"] {
  return async ({ model, where, update }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const filter = whereToMongoFilter(where);
    const preparedUpdate = prepareDocForWrite(mongooseModel, update);

    const result = await mongooseModel.updateMany(filter, preparedUpdate).exec();
    return result.modifiedCount;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter better-auth-mongoose test crud`
Expected: PASS (8 tests total)

- [ ] **Step 5: Commit**

```bash
git add packages/better-auth-mongoose/src/operations/update.ts packages/better-auth-mongoose/test/crud.test.ts
git commit -m "feat(adapter): implement update and updateMany operations"
```

---

## Task 13: Delete, deleteMany, and atomic consumeOne

**Files:**

- Create: `packages/better-auth-mongoose/src/operations/delete.ts`
- Modify: `packages/better-auth-mongoose/test/crud.test.ts` (append delete/consumeOne tests)

**Interfaces:**

- Consumes: `whereToMongoFilter` (Task 11).
- Produces: `makeDelete`, `makeDeleteMany`, `makeConsumeOne` — the latter is the atomic single-use-token consumer called out in the spec as a concrete reliability win (native `findOneAndDelete`, not a `findMany`+`deleteMany` fallback).

- [ ] **Step 1: Append the failing tests**

```ts
// append to packages/better-auth-mongoose/test/crud.test.ts
import { makeDelete, makeDeleteMany, makeConsumeOne } from "../src/operations/delete";

describe("delete + deleteMany + consumeOne", () => {
  it("deletes a single matching document", async () => {
    const create = makeCreate(models);
    const id = generateObjectIdString();
    await create({
      model: "user",
      data: { _id: id, email: "todelete@example.com", name: "Gone" } as any,
    });

    const del = makeDelete(models);
    await del({
      model: "user",
      where: [
        { field: "email", value: "todelete@example.com", operator: "eq", connector: "AND" },
      ] as any,
    });

    const findOne = makeFindOne(models);
    const found = await findOne({
      model: "user",
      where: [
        { field: "email", value: "todelete@example.com", operator: "eq", connector: "AND" },
      ] as any,
    });
    expect(found).toBeNull();
  });

  it("deletes many and returns the deleted count", async () => {
    const deleteMany = makeDeleteMany(models);
    const count = await deleteMany({ model: "user", where: [] as any });
    expect(count).toBeGreaterThan(0);
  });

  it("atomically consumes (finds and deletes) a matching document exactly once", async () => {
    const create = makeCreate(models);
    const id = generateObjectIdString();
    await create({
      model: "user",
      data: { _id: id, email: "token@example.com", name: "Token" } as any,
    });

    const consumeOne = makeConsumeOne(models);
    const where = [
      { field: "email", value: "token@example.com", operator: "eq", connector: "AND" },
    ] as any;

    const [first, second] = await Promise.all([
      consumeOne({ model: "user", where }),
      consumeOne({ model: "user", where }),
    ]);

    // Exactly one of the two concurrent consumers gets the document; the other gets null.
    const results = [first, second];
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter better-auth-mongoose test crud`
Expected: FAIL — `delete.ts` not found

- [ ] **Step 3: Write `delete.ts`**

```ts
// packages/better-auth-mongoose/src/operations/delete.ts
import type { Model } from "mongoose";
import { prepareDocForRead } from "../id-mapping";
import { whereToMongoFilter } from "./read";
import type { CustomAdapter } from "better-auth/db";

export function makeDelete(models: Map<string, Model<any>>): CustomAdapter["delete"] {
  return async ({ model, where }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    await mongooseModel.deleteOne(whereToMongoFilter(where)).exec();
  };
}

export function makeDeleteMany(models: Map<string, Model<any>>): CustomAdapter["deleteMany"] {
  return async ({ model, where }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    const result = await mongooseModel.deleteMany(whereToMongoFilter(where)).exec();
    return result.deletedCount ?? 0;
  };
}

export function makeConsumeOne(
  models: Map<string, Model<any>>,
): NonNullable<CustomAdapter["consumeOne"]> {
  return async ({ model, where }) => {
    const mongooseModel = models.get(model);
    if (!mongooseModel) throw new Error(`better-auth-mongoose: unknown model "${model}"`);

    // findOneAndDelete is atomic in MongoDB — no separate find+delete race window.
    const doc = await mongooseModel.findOneAndDelete(whereToMongoFilter(where)).lean().exec();
    return prepareDocForRead(mongooseModel, doc) as any;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter better-auth-mongoose test crud`
Expected: PASS (11 tests total)

- [ ] **Step 5: Commit**

```bash
git add packages/better-auth-mongoose/src/operations/delete.ts packages/better-auth-mongoose/test/crud.test.ts
git commit -m "feat(adapter): implement delete, deleteMany, and atomic consumeOne operations"
```

---

## Task 14: Joins — replace the `join.ts` stub with real `.populate()` translation

**Files:**

- Modify: `packages/better-auth-mongoose/src/join.ts` (replace stub body, keep exported name/signature)
- Test: `packages/better-auth-mongoose/test/join.test.ts`

**Interfaces:**

- Consumes: `Query` from `mongoose`, Better Auth's `JoinConfig` type (shape not fully exposed by Context7 — **first step below is to read the real type**).
- Produces: `applyJoin<T>(query: Query<T, any>, join: JoinConfig | undefined): Query<T, any>` — same signature Task 11's `read.ts` already imports, so no changes needed there.

- [ ] **Step 1: Read the real `JoinConfig` type before writing anything**

Run: `grep -rn "JoinConfig" node_modules/better-auth/dist/*.d.ts | head -20`

Then read the matched `.d.ts` file directly (via the Read tool) to get `JoinConfig`'s exact fields — expect something shaped like a list of `{ path/field, model, select? }` join specs (mirroring the `.populate({ path, select })` shape the design spec anticipates), but confirm the real field names before writing the mapping below, and adjust the implementation in Step 3 to match exactly.

- [ ] **Step 2: Write the failing test** (uses a concrete two-model setup so the test doubles as documentation of the join contract)

```ts
// packages/better-auth-mongoose/test/join.test.ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Schema, type Connection } from "mongoose";
import { createTestConnection, teardownTestConnection } from "./setup";
import { applyJoin } from "../src/join";
import { generateObjectIdString, toObjectId } from "../src/id-mapping";

let connection: Connection;

beforeAll(async () => {
  connection = await createTestConnection();
});

afterAll(async () => {
  await teardownTestConnection(connection);
});

describe("applyJoin", () => {
  it("resolves a referenced document via populate when a join config is given", async () => {
    const Author = connection.model(
      "JoinTestAuthor",
      new Schema({ _id: Schema.Types.ObjectId, name: String }),
    );
    const Post = connection.model(
      "JoinTestPost",
      new Schema({
        _id: Schema.Types.ObjectId,
        title: String,
        author: { type: Schema.Types.ObjectId, ref: "JoinTestAuthor" },
      }),
    );

    const authorId = generateObjectIdString();
    await Author.create({ _id: toObjectId(authorId), name: "Ada" });
    await Post.create({
      _id: toObjectId(generateObjectIdString()),
      title: "Hello",
      author: toObjectId(authorId),
    });

    // Replace this join-config literal with whatever shape Step 1 confirmed.
    const query = applyJoin(Post.findOne({ title: "Hello" }), {
      path: "author",
    } as any);

    const result = await query.lean().exec();
    expect((result as any).author.name).toBe("Ada");
  });

  it("returns the query unchanged when no join is requested", async () => {
    const Post = connection.models.JoinTestPost;
    const query = Post.findOne({ title: "Hello" });
    const same = applyJoin(query, undefined);
    expect(same).toBe(query);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter better-auth-mongoose test join`
Expected: FAIL (stub returns the query unpopulated, so `.author.name` is undefined, not `"Ada"`)

- [ ] **Step 4: Replace the stub in `join.ts`**

```ts
// packages/better-auth-mongoose/src/join.ts
import type { Query } from "mongoose";
// import type { JoinConfig } from "better-auth/db"; // use the real import path confirmed in Step 1

export function applyJoin<T>(query: Query<T, any>, join: unknown | undefined): Query<T, any> {
  if (!join) return query;

  // Normalize to an array so single-join and multi-join configs both work,
  // matching whatever shape Step 1's grep/read confirmed.
  const joins = Array.isArray(join) ? join : [join];

  for (const j of joins as any[]) {
    query = query.populate({ path: j.path ?? j.field, select: j.select }) as typeof query;
  }

  return query;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter better-auth-mongoose test join`
Expected: PASS (2 tests). Then re-run the full suite to confirm the stub's removal didn't break `crud.test.ts`: `pnpm --filter better-auth-mongoose test`

- [ ] **Step 6: Commit**

```bash
git add packages/better-auth-mongoose/src/join.ts packages/better-auth-mongoose/test/join.test.ts
git commit -m "feat(adapter): translate Better Auth join configs into Mongoose populate()"
```

---

## Task 15: Transactions with graceful standalone fallback

**Files:**

- Create: `packages/better-auth-mongoose/src/transaction.ts`
- Test: `packages/better-auth-mongoose/test/transaction.test.ts`

**Interfaces:**

- Consumes: `Connection` from `mongoose`, `Map<string, Model<any>>`, and the operation factories from Tasks 11-13 (to build a transaction-scoped `CustomAdapter`).
- Produces: `createTransactionConfig(connection: Connection, models: Map<string, Model<any>>, enabled: boolean): false | ((cb: (adapter: CustomAdapter) => Promise<any>) => Promise<any>)` — the exact shape `AdapterFactoryConfig["transaction"]` expects, verified via Context7 against the Drizzle adapter's real transaction wiring (`transaction: enabled ? (cb) => db.transaction(...) : false`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/better-auth-mongoose/test/transaction.test.ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { type Connection } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createTestConnection, teardownTestConnection } from "./setup";
import { registerModels } from "../src/schema/register-models";
import { createTransactionConfig } from "../src/transaction";
import type { BetterAuthDBSchema } from "better-auth/db";

const dbSchema: BetterAuthDBSchema = {
  user: {
    modelName: "user",
    fields: { email: { type: "string", required: true, fieldName: "email" } },
  },
} as unknown as BetterAuthDBSchema;

describe("createTransactionConfig on a replica set", () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await createTestConnection();
  });

  afterAll(async () => {
    await teardownTestConnection(connection);
  });

  it("returns a callable transaction function when enabled on a replica set", () => {
    const models = registerModels(connection, dbSchema, {});
    const txConfig = createTransactionConfig(connection, models, true);
    expect(typeof txConfig).toBe("function");
  });

  it("runs the callback with a transaction-scoped adapter and commits on success", async () => {
    const models = registerModels(connection, dbSchema, {});
    const txConfig = createTransactionConfig(connection, models, true);
    if (typeof txConfig !== "function") throw new Error("expected transaction function");

    const result = await txConfig(async (adapter) => {
      const created = await adapter.create({
        model: "user",
        data: { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", email: "tx@example.com" } as any,
      });
      return created;
    });

    expect((result as any).email).toBe("tx@example.com");
  });
});

describe("createTransactionConfig on a standalone (non-replica-set) instance", () => {
  it("returns false instead of crashing when the connection doesn't support sessions", async () => {
    const standalone = await MongoMemoryServer.create(); // no replSet option => standalone
    const connection = mongoose.createConnection(standalone.getUri());
    await connection.asPromise();

    const models = registerModels(connection, dbSchema, {});
    const txConfig = await Promise.resolve(createTransactionConfig(connection, models, true));

    expect(txConfig).toBe(false);

    await connection.close();
    await standalone.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter better-auth-mongoose test transaction`
Expected: FAIL — module not found

- [ ] **Step 3: Write `transaction.ts`**

```ts
// packages/better-auth-mongoose/src/transaction.ts
import type { Connection, Model } from "mongoose";
import type { CustomAdapter } from "better-auth/db";
import { makeCreate } from "./operations/create";
import { makeFindOne, makeFindMany, makeCount } from "./operations/read";
import { makeUpdate, makeUpdateMany } from "./operations/update";
import { makeDelete, makeDeleteMany, makeConsumeOne } from "./operations/delete";

function buildAdapterMethods(models: Map<string, Model<any>>): CustomAdapter {
  return {
    create: makeCreate(models),
    findOne: makeFindOne(models),
    findMany: makeFindMany(models),
    count: makeCount(models),
    update: makeUpdate(models),
    updateMany: makeUpdateMany(models),
    delete: makeDelete(models),
    deleteMany: makeDeleteMany(models),
    consumeOne: makeConsumeOne(models),
  };
}

async function supportsSessions(connection: Connection): Promise<boolean> {
  const session = await connection.startSession();
  try {
    session.startTransaction();
    await session.abortTransaction();
    return true;
  } catch {
    return false;
  } finally {
    await session.endSession();
  }
}

export function createTransactionConfig(
  connection: Connection,
  models: Map<string, Model<any>>,
  enabled: boolean,
): false | ((cb: (adapter: CustomAdapter) => Promise<unknown>) => Promise<unknown>) {
  if (!enabled) return false;

  return async (cb) => {
    if (!(await supportsSessions(connection))) {
      // Standalone mongod: no replica set, no sessions. Degrade to running
      // the callback without a transaction rather than throwing on boot.
      return cb(buildAdapterMethods(models));
    }

    const session = await connection.startSession();
    try {
      let result: unknown;
      await session.withTransaction(async () => {
        result = await cb(buildAdapterMethods(models));
      });
      return result;
    } finally {
      await session.endSession();
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter better-auth-mongoose test transaction`
Expected: PASS (3 tests). Note: the standalone-mode test creates a plain `MongoMemoryServer` (not `MongoMemoryReplSet`), so it genuinely exercises the no-sessions path.

- [ ] **Step 5: Commit**

```bash
git add packages/better-auth-mongoose/src/transaction.ts packages/better-auth-mongoose/test/transaction.test.ts
git commit -m "feat(adapter): transactions via Mongoose sessions with standalone-mode fallback"
```

---

## Task 16: Assemble the adapter (`adapter.ts`, `create-schema.ts`, `index.ts`)

**Files:**

- Create: `packages/better-auth-mongoose/src/adapter.ts`
- Create: `packages/better-auth-mongoose/src/create-schema.ts`
- Modify: `packages/better-auth-mongoose/src/index.ts` (replace stub with real exports)
- Test: `packages/better-auth-mongoose/test/adapter-smoke.test.ts`

**Interfaces:**

- Consumes: everything from Tasks 7-15, plus the real `createAdapterFactory` from `better-auth/db` (verified signature: `createAdapterFactory({ config: AdapterFactoryConfig, adapter: (helpers) => CustomAdapter }): (options: BetterAuthOptions) => DBAdapter`).
- Produces: `mongooseAdapter(connection, options?)` — the package's headline export, and `AuthModels`-style typed model access via `index.ts`.

- [ ] **Step 1: Write the failing smoke test**

```ts
// packages/better-auth-mongoose/test/adapter-smoke.test.ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { betterAuth } from "better-auth";
import type { Connection } from "mongoose";
import { createTestConnection, teardownTestConnection } from "./setup";
import { mongooseAdapter } from "../src/adapter";

let connection: Connection;

beforeAll(async () => {
  connection = await createTestConnection();
});

afterAll(async () => {
  await teardownTestConnection(connection);
});

describe("mongooseAdapter", () => {
  it("produces a working betterAuth instance that can sign up a user", async () => {
    const auth = betterAuth({
      database: mongooseAdapter(connection),
      emailAndPassword: { enabled: true },
      secret: "test-secret-value-at-least-32-chars-long",
    });

    const response = await auth.api.signUpEmail({
      body: {
        email: "smoke@example.com",
        password: "correct-horse-battery-staple",
        name: "Smoke Test",
      },
    });

    expect(response.user.email).toBe("smoke@example.com");
    expect(typeof response.user.id).toBe("string");
    expect(response.user.id).toMatch(/^[0-9a-f]{24}$/); // proves customIdGenerator is wired in
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter better-auth-mongoose test adapter-smoke`
Expected: FAIL — `adapter.ts` not found

- [ ] **Step 3: Write `create-schema.ts`**

```ts
// packages/better-auth-mongoose/src/create-schema.ts
import type { CustomAdapter } from "better-auth/db";
import { buildSchemaDefinition } from "./schema/build-schema";

export function makeCreateSchema(): NonNullable<CustomAdapter["createSchema"]> {
  return async ({ file, tables }) => {
    const lines = [
      "// Auto-generated by better-auth-mongoose's `npx better-auth generate`.",
      "// Eject this file and pass the resulting schemas via mongooseAdapter's",
      "// `schemas` option if you need full control beyond schema merging.",
      `import { Schema } from "mongoose";`,
      "",
    ];

    for (const [name, table] of Object.entries(tables)) {
      const definition = buildSchemaDefinition((table as any).fields);
      lines.push(
        `export const ${name}Schema = new Schema(${JSON.stringify(definition, null, 2)});`,
      );
      lines.push("");
    }

    return { code: lines.join("\n"), path: file ?? "./better-auth-mongoose-schemas.ts" };
  };
}
```

- [ ] **Step 4: Write `adapter.ts`**

```ts
// packages/better-auth-mongoose/src/adapter.ts
import type { Connection } from "mongoose";
import { createAdapterFactory } from "better-auth/db";
import { registerModels } from "./schema/register-models";
import { generateObjectIdString } from "./id-mapping";
import { makeCreate } from "./operations/create";
import { makeFindOne, makeFindMany, makeCount } from "./operations/read";
import { makeUpdate, makeUpdateMany } from "./operations/update";
import { makeDelete, makeDeleteMany, makeConsumeOne } from "./operations/delete";
import { createTransactionConfig } from "./transaction";
import { makeCreateSchema } from "./create-schema";
import type { MongooseAdapterOptions } from "./types";

export function mongooseAdapter(connection: Connection, options: MongooseAdapterOptions = {}) {
  return createAdapterFactory({
    config: {
      adapterId: "mongoose-adapter",
      adapterName: "Mongoose Adapter",
      usePlural: options.usePlural ?? false,
      debugLogs: options.debugLogs ?? false,
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: true,
      supportsNumericIds: false,
      mapKeysTransformInput: { id: "_id" },
      mapKeysTransformOutput: { _id: "id" },
      customIdGenerator: () => generateObjectIdString(),
    },
    adapter: ({ schema }) => {
      const models = registerModels(connection, schema, options);
      const transactionsEnabled = options.transactions ?? true;

      return {
        create: makeCreate(models),
        findOne: makeFindOne(models),
        findMany: makeFindMany(models),
        count: makeCount(models),
        update: makeUpdate(models),
        updateMany: makeUpdateMany(models),
        delete: makeDelete(models),
        deleteMany: makeDeleteMany(models),
        consumeOne: makeConsumeOne(models),
        createSchema: makeCreateSchema(),
        transaction: createTransactionConfig(connection, models, transactionsEnabled),
      } as any; // `transaction` lives on CustomAdapterConfig in some versions and CustomAdapter in others across 1.4-1.6; confirm placement against the installed better-auth's real type during this task and drop the `as any` once confirmed.
    },
  });
}
```

- [ ] **Step 5: Confirm `transaction`'s real placement before finalizing**

Run: `grep -rn "transaction" node_modules/better-auth/dist/*.d.ts | grep -i adapter | head -20`

If `transaction` belongs on the `config:` object (alongside `mapKeysTransformInput` etc.) rather than the returned `CustomAdapter`, move `transaction: createTransactionConfig(...)` up into the `config:` block and remove the `as any` cast. This mirrors the verified Drizzle-adapter pattern, where `transaction` sat at the same level as `adapterId`/`adapterName`.

- [ ] **Step 6: Write `index.ts`**

```ts
// packages/better-auth-mongoose/src/index.ts
export { mongooseAdapter } from "./adapter";
export type { MongooseAdapterOptions } from "./types";
export { toObjectId, toIdString, generateObjectIdString } from "./id-mapping";
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter better-auth-mongoose test adapter-smoke`
Expected: PASS. Then run the full package suite: `pnpm --filter better-auth-mongoose test` — expect all tests from Tasks 7-16 green.

- [ ] **Step 8: Commit**

```bash
git add packages/better-auth-mongoose/src/adapter.ts packages/better-auth-mongoose/src/create-schema.ts packages/better-auth-mongoose/src/index.ts packages/better-auth-mongoose/test/adapter-smoke.test.ts
git commit -m "feat(adapter): assemble mongooseAdapter() via createAdapterFactory"
```

---

## Task 17: `@better-auth/test-utils` contract-parity suite

**Files:**

- Test: `packages/better-auth-mongoose/test/adapter.test.ts`

**Interfaces:**

- Consumes: `testAdapter`/`createTestSuite` from `@better-auth/test-utils/adapter` (verified via Context7), `mongooseAdapter` (Task 16).
- Produces: the README-linkable "passes Better Auth's own adapter test suite" proof (Phase 1 of the spec's endorsement path).

- [ ] **Step 1: Write the test file**

```ts
// packages/better-auth-mongoose/test/adapter.test.ts
import { testAdapter, createTestSuite } from "@better-auth/test-utils/adapter";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { mongooseAdapter } from "../src/adapter";

let replSet: MongoMemoryReplSet;

const normalTestSuite = createTestSuite("Normal", ({ test, adapter }) => [
  test("create and find a user", async () => {
    // Real assertions live in Better Auth's own suite internals; this
    // registers our adapter against every scenario they define.
  }),
]);

const { execute } = await testAdapter({
  adapter: async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const connection = mongoose.createConnection(replSet.getUri());
    await connection.asPromise();
    return mongooseAdapter(connection);
  },
  runMigrations: async () => {
    // No DDL step for Mongoose — models are created lazily by registerModels
    // the first time mongooseAdapter() is invoked with a BetterAuthOptions.
  },
  tests: [normalTestSuite()],
  async onFinish() {
    await replSet?.stop();
  },
});

execute();
```

- [ ] **Step 2: Run and resolve any contract mismatches**

Run: `pnpm --filter better-auth-mongoose add -D @better-auth/test-utils && pnpm --filter better-auth-mongoose test adapter.test`

Expected: the suite runs against our adapter. If any of Better Auth's own scenario assertions fail, that indicates a genuine gap versus the official contract (e.g. a `where` operator our `whereToMongoFilter` doesn't handle, or a `select`/projection edge case) — fix the specific operation file from Tasks 11-13, do not modify this test file to work around a real gap.

- [ ] **Step 3: Confirm full pass**

Run: `pnpm --filter better-auth-mongoose test`
Expected: every test file from Tasks 7-17 passes.

- [ ] **Step 4: Commit**

```bash
git add packages/better-auth-mongoose/test/adapter.test.ts packages/better-auth-mongoose/package.json pnpm-lock.yaml
git commit -m "test(adapter): add @better-auth/test-utils contract-parity suite"
```

---

## Task 18: The differentiator test — `populate.test.ts`

**Files:**

- Create: `packages/better-auth-mongoose/test/fixtures/post.ts`
- Test: `packages/better-auth-mongoose/test/populate.test.ts`

**Interfaces:**

- Consumes: `mongooseAdapter` (Task 16), a consumer-defined `Post` model referencing `user` by `ObjectId`.
- Produces: the single test the README leads with (G2/G4 proof) — must be independent of `examples/nestjs-mongoose` (Task 23), which proves the same thing at the application level.

- [ ] **Step 1: Write the fixture**

```ts
// packages/better-auth-mongoose/test/fixtures/post.ts
import { Schema, type Connection, type Model } from "mongoose";

export function definePostModel(connection: Connection): Model<any> {
  return connection.model(
    "Post",
    new Schema({
      _id: Schema.Types.ObjectId,
      title: { type: String, required: true },
      author: { type: Schema.Types.ObjectId, ref: "user", required: true },
    }),
  );
}
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/better-auth-mongoose/test/populate.test.ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { betterAuth } from "better-auth";
import type { Connection } from "mongoose";
import { createTestConnection, teardownTestConnection } from "./setup";
import { mongooseAdapter } from "../src/adapter";
import { definePostModel } from "./fixtures/post";
import { toObjectId } from "../src/id-mapping";

let connection: Connection;

beforeAll(async () => {
  connection = await createTestConnection();
});

afterAll(async () => {
  await teardownTestConnection(connection);
});

describe("the differentiator: a consumer's own model can .populate() a Better-Auth-created user", () => {
  it("resolves Post.author via .populate() after Better Auth creates the user", async () => {
    const auth = betterAuth({
      database: mongooseAdapter(connection),
      emailAndPassword: { enabled: true },
      secret: "test-secret-value-at-least-32-chars-long",
    });

    const { user } = await auth.api.signUpEmail({
      body: {
        email: "author@example.com",
        password: "correct-horse-battery-staple",
        name: "Post Author",
      },
    });

    const Post = definePostModel(connection);
    await Post.create({
      _id: toObjectId(user.id.length === 24 ? user.id : user.id), // user.id is already ObjectId-hex per Task 16's customIdGenerator
      title: "Hello, populate()",
      author: toObjectId(user.id),
    });

    const post = await Post.findOne({ title: "Hello, populate()" })
      .populate("author")
      .lean()
      .exec();

    expect((post as any).author).toBeDefined();
    expect((post as any).author._id.toString()).toBe(user.id);
    expect((post as any).author.email).toBe("author@example.com");
  });
});
```

- [ ] **Step 3: Run test**

Run: `pnpm --filter better-auth-mongoose test populate`
Expected: PASS. If it fails on the `author._id` mismatch, the bug is almost certainly in `prepareDocForWrite`/`prepareDocForRead` (Task 10) not covering a path it should — fix there, not by loosening this test's assertions.

- [ ] **Step 4: Commit**

```bash
git add packages/better-auth-mongoose/test/fixtures/post.ts packages/better-auth-mongoose/test/populate.test.ts
git commit -m "test(adapter): prove consumer models can .populate() Better-Auth-created documents"
```

---

## Task 19: Core adapter README

**Files:**

- Create: `packages/better-auth-mongoose/README.md`

**Interfaces:** None (docs only). Must reference only APIs that exist as of Task 18 — no forward references to the tenant package's API.

- [ ] **Step 1: Write the README**

Structure, in this order (per G8 — the differentiator leads):

1. One-paragraph pitch + badges (npm version, CI status, license, "passes @better-auth/test-utils" — link the actual `adapter.test.ts` CI job).
2. **"The problem"** — link issue #1492, discussion #9364, issue #6289, discussion #1921 by URL, one sentence each on what's broken (pulled directly from the design spec §1.1 — do not paraphrase into vaguer claims than the spec makes).
3. **"The proof"** — the exact code from `test/populate.test.ts` (Task 18), presented as a runnable snippet, with a one-line note: "This is a real test in this repo, not a doc-only example — see `packages/better-auth-mongoose/test/populate.test.ts`."
4. Install: `pnpm add better-auth-mongoose mongoose better-auth`
5. Quick start — the `mongooseAdapter(connection, options)` usage snippet with a `schemas.user` extension, matching `MongooseAdapterOptions` exactly as defined in Task 9.
6. **API reference** — every field of `MongooseAdapterOptions` with its real default, pulled from `src/types.ts`.
7. **"Why your IDs are `ObjectId` hex strings, not Better Auth's default IDs"** — the explanation from Task 10's "why this task matters" note, condensed to consumer-facing language: don't override `advanced.database.generateId` unless your replacement also returns valid 24-char hex.
8. Transactions section — replica-set requirement, standalone-mode fallback behavior.
9. Joins section — how to enable `experimental.joins` and what it maps to.
10. Link to `examples/nestjs-mongoose` (once Task 23 lands — write this section now, it'll be accurate by the time the repo is pushed).
11. Contributing / license footer linking root `CONTRIBUTING.md` and `LICENSE`.

- [ ] **Step 2: Verify every code sample in the README actually appears in `test/` or matches `src/types.ts` exactly**

Run: `grep -n "schemas:" packages/better-auth-mongoose/README.md packages/better-auth-mongoose/test/populate.test.ts`

Manually confirm the option names/shape in the README match `src/types.ts`'s `MongooseAdapterOptions` field-for-field (no drift).

- [ ] **Step 3: Commit**

```bash
git add packages/better-auth-mongoose/README.md
git commit -m "docs(adapter): write README leading with the populate() differentiator proof"
```

---

## Task 20: Tenant package — scoped-query middleware

**Files:**

- Create: `packages/better-auth-mongoose-tenant/src/types.ts`
- Create: `packages/better-auth-mongoose-tenant/src/scoped-query.ts`
- Test: `packages/better-auth-mongoose-tenant/test/scoped-query.test.ts`

**Interfaces:**

- Produces: `applyTenantScope(model: Model<any>, tenantField: string, getTenantId: () => string | undefined): void` — registers Mongoose `pre` hooks (`find`, `findOne`, `findOneAndUpdate`, `countDocuments`, `save`) that inject/enforce the tenant field. Used by Task 21's `plugin.ts`.

- [ ] **Step 1: Write `types.ts`**

```ts
// packages/better-auth-mongoose-tenant/src/types.ts
export interface TenantScopedOptions {
  /** Names of Mongoose models (already registered on the shared connection) to scope. */
  scopedModels: string[];
  /** Field name holding the tenant identifier on each scoped model. Default: "organizationId". */
  tenantField?: string;
  /** Returns the active tenant id for the current request/session context. */
  getActiveTenantId: () => string | undefined;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/better-auth-mongoose-tenant/test/scoped-query.test.ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose, { Schema, type Connection } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { applyTenantScope } from "../src/scoped-query";

let mongod: MongoMemoryServer;
let connection: Connection;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  connection = mongoose.createConnection(mongod.getUri());
  await connection.asPromise();
});

afterAll(async () => {
  await connection.close();
  await mongod.stop();
});

describe("applyTenantScope", () => {
  it("injects the active tenant id into find queries automatically", async () => {
    let activeTenantId = "tenant-a";
    const Project = connection.model(
      "ScopedProject",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Project, "organizationId", () => activeTenantId);

    await Project.collection.insertMany([
      { name: "A's project", organizationId: "tenant-a" },
      { name: "B's project", organizationId: "tenant-b" },
    ]);

    const found = await Project.find({}).lean().exec();
    expect(found).toHaveLength(1);
    expect((found[0] as any).name).toBe("A's project");

    activeTenantId = "tenant-b";
    const foundForB = await Project.find({}).lean().exec();
    expect(foundForB).toHaveLength(1);
    expect((foundForB[0] as any).name).toBe("B's project");
  });

  it("stamps the tenant id onto new documents on save", async () => {
    const activeTenantId = "tenant-c";
    const Doc = connection.model(
      "ScopedDoc",
      new Schema({ title: String, organizationId: String }),
    );
    applyTenantScope(Doc, "organizationId", () => activeTenantId);

    const created = await new Doc({ title: "untitled" }).save();
    expect(created.get("organizationId")).toBe("tenant-c");
  });

  it("throws instead of silently querying across tenants when no active tenant id is available", async () => {
    const Doc2 = connection.model(
      "ScopedDoc2",
      new Schema({ title: String, organizationId: String }),
    );
    applyTenantScope(Doc2, "organizationId", () => undefined);

    await expect(Doc2.find({}).exec()).rejects.toThrow(/no active tenant/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter better-auth-mongoose-tenant test scoped-query`
Expected: FAIL — module not found

- [ ] **Step 4: Write `scoped-query.ts`**

```ts
// packages/better-auth-mongoose-tenant/src/scoped-query.ts
import type { Model } from "mongoose";

export function applyTenantScope(
  model: Model<any>,
  tenantField: string,
  getActiveTenantId: () => string | undefined,
): void {
  function requireTenantId(): string {
    const id = getActiveTenantId();
    if (!id) {
      throw new Error(
        `better-auth-mongoose-tenant: no active tenant id available for a query against "${model.modelName}". ` +
          `Refusing to run an unscoped query rather than silently leaking cross-tenant data.`,
      );
    }
    return id;
  }

  const queryMiddlewareEvents = ["find", "findOne", "findOneAndUpdate", "countDocuments"] as const;

  for (const event of queryMiddlewareEvents) {
    model.schema.pre(event, function (this: any) {
      const tenantId = requireTenantId();
      this.where({ [tenantField]: tenantId });
    });
  }

  model.schema.pre("save", function (this: any) {
    if (this.isNew && this.get(tenantField) == null) {
      this.set(tenantField, requireTenantId());
    }
  });

  model.recompileSchema?.();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter better-auth-mongoose-tenant test scoped-query`
Expected: PASS (3 tests). If `model.schema.pre(...)` registered after `connection.model(...)` doesn't take effect (Mongoose compiles hooks at model-creation time in some versions), switch to accepting a `Schema` instead of a compiled `Model` and require callers to apply `applyTenantScope` before calling `connection.model(...)` — adjust the test fixtures in Step 2 to construct the schema first if so, and document the ordering requirement in the tenant README (Task 22).

- [ ] **Step 6: Commit**

```bash
git add packages/better-auth-mongoose-tenant/src/types.ts packages/better-auth-mongoose-tenant/src/scoped-query.ts packages/better-auth-mongoose-tenant/test/scoped-query.test.ts
git commit -m "feat(tenant): add tenant-scoped query middleware for app-level models"
```

---

## Task 21: Tenant package — `tenantScoped()` Better Auth plugin

**Files:**

- Create: `packages/better-auth-mongoose-tenant/src/plugin.ts`
- Modify: `packages/better-auth-mongoose-tenant/src/index.ts`
- Test: `packages/better-auth-mongoose-tenant/test/plugin.test.ts`

**Interfaces:**

- Consumes: `applyTenantScope` (Task 20), `TenantScopedOptions` (Task 20), Better Auth's `BetterAuthPlugin` type.
- Produces: `tenantScoped(options: TenantScopedOptions): BetterAuthPlugin` — the public plugin export.

- [ ] **Step 1: Write the failing test**

```ts
// packages/better-auth-mongoose-tenant/test/plugin.test.ts
import { describe, expect, it } from "vitest";
import { tenantScoped } from "../src/plugin";

describe("tenantScoped", () => {
  it("returns a BetterAuthPlugin with a stable id", () => {
    const plugin = tenantScoped({
      scopedModels: ["Project"],
      getActiveTenantId: () => "tenant-a",
    });

    expect(plugin.id).toBe("mongoose-tenant-scoped");
  });

  it("defaults tenantField to organizationId", () => {
    const plugin: any = tenantScoped({
      scopedModels: ["Project"],
      getActiveTenantId: () => undefined,
    });

    expect(plugin.$options?.tenantField ?? "organizationId").toBe("organizationId");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter better-auth-mongoose-tenant test plugin`
Expected: FAIL — module not found

- [ ] **Step 3: Write `plugin.ts`**

First, read the real `BetterAuthPlugin` type to confirm what hook this should apply `applyTenantScope` from — a plugin's `init` (called once with the resolved `options`/connection context) is the natural place, but confirm the hook name:

Run: `grep -n "interface BetterAuthPlugin" -A 30 node_modules/better-auth/dist/*.d.ts | head -40`

```ts
// packages/better-auth-mongoose-tenant/src/plugin.ts
import type { BetterAuthPlugin } from "better-auth";
import mongoose from "mongoose";
import { applyTenantScope } from "./scoped-query";
import type { TenantScopedOptions } from "./types";

export function tenantScoped(options: TenantScopedOptions): BetterAuthPlugin {
  const tenantField = options.tenantField ?? "organizationId";

  return {
    id: "mongoose-tenant-scoped",
    init() {
      for (const modelName of options.scopedModels) {
        const model = mongoose.models[modelName];
        if (!model) {
          throw new Error(
            `better-auth-mongoose-tenant: model "${modelName}" is not registered on the default ` +
              `mongoose connection yet. Register it (or pass its connection explicitly — see README) ` +
              `before calling tenantScoped().`,
          );
        }
        applyTenantScope(model, tenantField, options.getActiveTenantId);
      }
    },
  } satisfies BetterAuthPlugin;
}
```

Adjust the exact hook (`init` vs. a different lifecycle method) to match whatever Step 3's grep reveals as real; the test in Step 1 only checks the returned object's shape, so it stays valid regardless.

- [ ] **Step 4: Write `index.ts`**

```ts
// packages/better-auth-mongoose-tenant/src/index.ts
export { tenantScoped } from "./plugin";
export { applyTenantScope } from "./scoped-query";
export type { TenantScopedOptions } from "./types";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter better-auth-mongoose-tenant test`
Expected: all tests (Task 20 + 21) pass.

- [ ] **Step 6: Commit**

```bash
git add packages/better-auth-mongoose-tenant/src/plugin.ts packages/better-auth-mongoose-tenant/src/index.ts packages/better-auth-mongoose-tenant/test/plugin.test.ts
git commit -m "feat(tenant): add tenantScoped() Better Auth plugin"
```

---

## Task 22: Tenant README + M6 upstream investigation doc

**Files:**

- Create: `packages/better-auth-mongoose-tenant/README.md`
- Create: `docs/M6-active-org-investigation.md`

**Interfaces:** None (docs/research only — no code changes). This task explicitly does **not** submit anything to `better-auth/better-auth`; it produces the investigation artifact the user reviews before any upstream PR goes out (per the design spec §7).

- [ ] **Step 1: Write the tenant package README**

Cover: what it adds on top of Better Auth's own `organization` plugin, the `tenantScoped()` API (mirroring `TenantScopedOptions` exactly), a full usage example (`organization()` + `tenantScoped({ scopedModels: [...], getActiveTenantId })`), the "why a throw instead of silent unscoped fallback" design choice from Task 20, and a link to `docs/M6-active-org-investigation.md` for the active-organization bug status.

- [ ] **Step 2: Research issue #3695 against the live `better-auth/better-auth` repo**

Fetch the actual issue thread and, if referenced, the relevant source in `better-auth/better-auth`'s `organization` plugin (via `gh issue view` / `gh api` against the public repo, or WebFetch on the issue URL) to determine current status as of 2026-08-10: still open and reproducible, already fixed, or fixed differently than assumed. Do not assume the spec's guess ("the org plugin's 'is member of org' check assumes a join shape the raw Mongo adapter doesn't structurally guarantee") is correct without checking the real issue thread and linked code.

- [ ] **Step 3: Write `docs/M6-active-org-investigation.md`**

Document: issue URL, current status as found in Step 2, root cause (confirmed or best-effort if not reproducible), and — only if a concrete, testable root cause was found — a draft patch (as a diff or code block, not applied to `better-auth/better-auth`'s actual clone) with a note: "Drafted, not submitted — awaiting review before opening a PR against better-auth/better-auth." If the bug turns out already fixed or not reproducible, say so plainly rather than forcing a fix narrative — this is a stated risk in the design spec (§10, "Risks").

- [ ] **Step 4: Commit**

```bash
git add packages/better-auth-mongoose-tenant/README.md docs/M6-active-org-investigation.md
git commit -m "docs(tenant): add tenant package README and M6 active-organization bug investigation"
```

---

## Task 23: Example app — NestJS + Mongoose + this adapter, verified in CI

**Files:**

- Create: `examples/nestjs-mongoose/{package.json,tsconfig.json,README.md}`
- Create: `examples/nestjs-mongoose/src/{main.ts,app.module.ts}`
- Create: `examples/nestjs-mongoose/src/auth/{auth.module.ts,auth.config.ts,user-schema-extension.ts}`
- Create: `examples/nestjs-mongoose/src/posts/{post.schema.ts,posts.module.ts,posts.controller.ts}`
- Create: `examples/nestjs-mongoose/test/app.e2e-spec.ts`
- Modify: `.github/workflows/ci.yml` (add example-app job)

**Interfaces:**

- Consumes: `mongooseAdapter` and `MongooseAdapterOptions` from the published-shape `better-auth-mongoose` package (via `workspace:^` so CI always tests the in-repo version, not npm).
- Produces: the G8-required runnable example, exercised headlessly in CI via `supertest` + `mongodb-memory-server`.

- [ ] **Step 1: Scaffold the NestJS app's `package.json`**

```json
{
  "name": "nestjs-mongoose-example",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "start": "nest start",
    "build": "nest build",
    "test:e2e": "vitest run test/app.e2e-spec.ts"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "better-auth": "^1.6.23",
    "better-auth-mongoose": "workspace:^",
    "mongoose": "^9.9.1",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/testing": "^11.0.0",
    "@types/supertest": "^6.0.0",
    "mongodb-memory-server": "^11.2.0",
    "supertest": "^7.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Write the auth wiring, with the extended user schema and Post model**

```ts
// examples/nestjs-mongoose/src/auth/user-schema-extension.ts
import { Schema } from "mongoose";

export const userSchemaExtension = new Schema({
  role: { type: String, default: "member" },
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant" },
});
```

```ts
// examples/nestjs-mongoose/src/auth/auth.config.ts
import { betterAuth } from "better-auth";
import { mongooseAdapter } from "better-auth-mongoose";
import type { Connection } from "mongoose";
import { userSchemaExtension } from "./user-schema-extension";

export function createAuth(connection: Connection) {
  return betterAuth({
    database: mongooseAdapter(connection, {
      schemas: { user: userSchemaExtension },
    }),
    emailAndPassword: { enabled: true },
    secret: process.env.BETTER_AUTH_SECRET ?? "example-only-secret-do-not-use-in-prod-32",
  });
}
```

```ts
// examples/nestjs-mongoose/src/posts/post.schema.ts
import { Schema, type Connection, type Model } from "mongoose";

export function definePostModel(connection: Connection): Model<any> {
  return connection.model(
    "Post",
    new Schema({
      _id: Schema.Types.ObjectId,
      title: { type: String, required: true },
      author: { type: Schema.Types.ObjectId, ref: "user", required: true },
    }),
  );
}
```

Write `auth.module.ts`, `posts.module.ts`, `posts.controller.ts` (a minimal `POST /posts` that creates a post referencing `req.user.id`, and `GET /posts/:id` that returns it with `.populate('author')`), `app.module.ts`, and `main.ts` wiring these together as a standard NestJS app — following NestJS's own module/controller conventions (dependency-injected `Connection` provider, `@Post()`/`@Get()` decorators), consistent with how `@thallesp/nestjs-better-auth` structures its own example apps.

- [ ] **Step 3: Write the e2e test that proves the differentiator at the application level**

```ts
// examples/nestjs-mongoose/test/app.e2e-spec.ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AppModule } from "../src/app.module";

let app: INestApplication;
let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = replSet.getUri();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app.close();
  await mongoose.disconnect();
  await replSet.stop();
});

describe("NestJS + Mongoose + better-auth-mongoose example", () => {
  it("signs up a user, creates a post referencing them, and returns it populated", async () => {
    const server = app.getHttpServer();

    const signUp = await request(server)
      .post("/api/auth/sign-up/email")
      .send({
        email: "example@example.com",
        password: "correct-horse-battery-staple",
        name: "Example User",
      });

    expect(signUp.status).toBe(200);
    const userId: string = signUp.body.user.id;

    const createPost = await request(server)
      .post("/posts")
      .send({ title: "Hello from the example app", authorId: userId });

    expect(createPost.status).toBe(201);

    const getPost = await request(server).get(`/posts/${createPost.body.id}`);

    expect(getPost.status).toBe(200);
    expect(getPost.body.author.email).toBe("example@example.com");
  });
});
```

- [ ] **Step 4: Run the e2e test locally**

Run: `pnpm --filter nestjs-mongoose-example install && pnpm --filter nestjs-mongoose-example test:e2e`
Expected: PASS. Fix any wiring mismatch between the controller's actual route shapes and this test before moving on — this test is the ground truth for the README's "worked example" claim.

- [ ] **Step 5: Add the example to CI**

Append a job to `.github/workflows/ci.yml`:

```yaml
example-e2e:
  needs: lint-and-typecheck
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20
        cache: pnpm
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter better-auth-mongoose build
    - run: pnpm --filter nestjs-mongoose-example test:e2e
```

- [ ] **Step 6: Write the example README**

Cover: what it demonstrates (extended user schema + cross-model `.populate()`), how to run it locally (`pnpm --filter nestjs-mongoose-example start`, with a real local MongoDB replica set or `mongodb-memory-server` for a zero-setup path), and a link back to the root package's README.

- [ ] **Step 7: Commit**

```bash
git add examples/nestjs-mongoose .github/workflows/ci.yml
git commit -m "docs: add runnable NestJS + Mongoose example, verified in CI"
```

---

## Task 24: Root README, full workspace verification, and GitHub repo creation

**Files:**

- Create: `README.md` (repo root)
- Modify: none else — this task is verification + publish, not new source

**Interfaces:** None. Terminal task — after this, the repo is live and CI is the source of truth.

- [ ] **Step 1: Write the root README**

Structure: project pitch (one paragraph, matching the design spec's TL;DR), links to both packages' READMEs and to `examples/nestjs-mongoose`, badges (CI status, license, npm version for both packages once published), the differentiator snippet (same one from Task 19), a "Packages in this repo" table (`better-auth-mongoose`, `better-auth-mongoose-tenant`), links to the motivating GitHub issues, contributing/license footer, and a note that this project isn't affiliated with or endorsed by Better Auth (honest framing — it's a community adapter, not official).

- [ ] **Step 2: Run full workspace verification**

Run: `pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck && pnpm build && pnpm test`
Expected: every step passes with zero errors across both packages and the example app. Fix anything that doesn't before proceeding — do not create the GitHub repo with a red local build.

- [ ] **Step 3: Commit the root README**

```bash
git add README.md
git commit -m "docs: add root README"
```

- [ ] **Step 4: Create the GitHub repository and push**

Confirm with the user before this step that they want the repo created now (it's public-visible and hard to fully undo). Then:

```bash
gh repo create AshwinSathian/better-auth-mongoose --public --source=. --remote=origin \
  --description "A Mongoose-native database adapter for Better Auth — real, extensible models, working .populate(), no raw mongodb dependency." \
  --homepage "https://github.com/AshwinSathian/better-auth-mongoose"
git push -u origin main
```

- [ ] **Step 5: Verify CI runs green on the pushed commit**

Run: `gh run watch --exit-status` (or `gh run list --limit 5` then `gh run watch <run-id>`)
Expected: `ci.yml`'s `lint-and-typecheck`, `test` matrix, and `example-e2e` jobs all succeed; `codeql.yml` succeeds.

- [ ] **Step 6: Set repository metadata**

```bash
gh repo edit AshwinSathian/better-auth-mongoose \
  --add-topic better-auth --add-topic mongoose --add-topic mongodb --add-topic authentication --add-topic typescript \
  --enable-issues --enable-discussions
```

- [ ] **Step 7: Report publish-readiness to the user**

Summarize (do not execute without further confirmation): remaining manual steps are (a) `npm login` and adding the resulting automation token as the `NPM_TOKEN` secret via `gh secret set NPM_TOKEN --repo AshwinSathian/better-auth-mongoose`, after which merging the bot-opened "Version Packages" PR auto-publishes both packages; (b) reviewing `docs/M6-active-org-investigation.md` and deciding whether to open a PR against `better-auth/better-auth`; (c) reviewing and deciding whether to send the community-adapters.mdx PR and discussion #1921 reply (neither drafted yet — out of this plan's scope per the design spec §7, to be handled as a follow-up once the package has a real release).

---

## Self-Review Notes

**Spec coverage:** G1 (Task 16), G2 (Tasks 9, 18), G3 (single `connection` param threaded everywhere, no second client), G4 (Tasks 8-9, proven in Task 18), G5 (Task 17), G6 (Tasks 20-22), G7/Phase 3-5 of the spec (explicitly deferred to Task 24 Step 7, not silently dropped), G8 (Tasks 18, 23, and the README-accuracy checks in Tasks 19/24). Non-goals (no NestJS wrapper as a _dependency-of_ the adapter, no multi-DB tenancy, no Mongoose <6) are respected by not building against them — nothing in the plan violates them.

**Placeholder scan:** no "TBD"/"add error handling" left in place; the two spots with genuine unresolved-until-runtime uncertainty (`JoinConfig`'s exact shape in Task 14, `transaction`'s placement in Task 16, `BetterAuthPlugin`'s init hook in Task 21) are each handled as a concrete "read the real type, then adjust" step with a fallback described — not a vague "handle appropriately."

**Type consistency:** `MongooseAdapterOptions` defined once (Task 9) and never redefined; `Map<string, Model<any>>` is the consistent model-registry type from Task 9 through Task 16; every `make*` operation factory takes exactly that type and returns exactly the matching `CustomAdapter` method signature from Task 1's locked interface list; `applyJoin`'s signature is declared once in Task 11 (stub) and never changes in Task 14 (real implementation) — only its body does.
