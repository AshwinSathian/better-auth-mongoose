# Contributing to better-auth-mongoose

Thanks for considering a contribution. This is a small, solo-maintained project, so issues and PRs are welcome, but please bear with response times.

## Development setup

```bash
git clone https://github.com/AshwinSathian/better-auth-mongoose.git
cd better-auth-mongoose
pnpm install
```

Requires Node.js 20.19+ (the minimum supported by Mongoose 9 / the `mongodb` driver it depends on) and [pnpm](https://pnpm.io). Node version is pinned in `.nvmrc` (`nvm use`).

## Running tests

```bash
pnpm test
```

Tests use [`mongodb-memory-server`](https://github.com/typegoose/mongodb-memory-server), which downloads a real `mongod` binary the first time you run tests (cached afterward). No external MongoDB instance is required.

Run a single package's tests during iteration:

```bash
pnpm --filter better-auth-mongoose test
pnpm --filter better-auth-mongoose-tenant test
```

## Before opening a PR

1. `pnpm lint` and `pnpm typecheck` must pass.
2. `pnpm test` must pass, and new behavior should come with a test proving it (see `packages/better-auth-mongoose/test/populate.test.ts` for the style: real assertions against a real in-memory MongoDB, not mocks).
3. If your change touches published code in `packages/*`, run `pnpm changeset` and describe the change. This drives the automated release notes and version bump. Skip this for docs-only or CI-only changes.
4. Keep PRs focused. A bug fix doesn't need an unrelated refactor riding along.

## Commit style

Plain, descriptive commit messages (`feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`, `test: ...`). Not strictly enforced, but appreciated for a readable history.

## What CI checks

Every PR runs lint, typecheck, the full test suite across Node 20/22 and every `better-auth` minor version in this package's supported peer range, and the NestJS example's end-to-end test. All of it needs to be green before merge.

## Questions

Open a [discussion](https://github.com/AshwinSathian/better-auth-mongoose/discussions) or an issue. See `SECURITY.md` instead if it's a vulnerability report.
