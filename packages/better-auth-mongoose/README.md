# better-auth-mongoose

[![CI](https://github.com/AshwinSathian/better-auth-mongoose/actions/workflows/ci.yml/badge.svg)](https://github.com/AshwinSathian/better-auth-mongoose/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/better-auth-mongoose.svg)](https://www.npmjs.com/package/better-auth-mongoose)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)

A Mongoose-native database adapter for [Better Auth](https://www.better-auth.com): real, extensible Mongoose models for Better Auth's own tables, so `.populate()`, schema validation, and hooks all work normally from your own application code. No raw `mongodb` dependency.

**[better-auth-mongoose.ashwinsathian.com](https://better-auth-mongoose.ashwinsathian.com)** — recipes, a compatibility matrix, and the full case for why this package exists.

## The problem

Better Auth's official MongoDB adapter (`mongodbAdapter` from `better-auth/adapters/mongodb`) talks to the raw [`mongodb`](https://www.npmjs.com/package/mongodb) driver directly, not Mongoose. If your app already uses Mongoose (the standard ODM for Node + MongoDB, and close to universal in NestJS/Express backends), this creates real, documented problems:

- **A forced extra dependency:** you end up with the raw `mongodb` driver installed even in projects that only ever use Mongoose ([issue #1492](https://github.com/better-auth/better-auth/issues/1492)).
- **Two parallel connections, no shared schema:** Better Auth writes `user`/`session`/`account`/`verification` documents directly via `MongoClient`, bypassing Mongoose entirely. No validation, no hooks, no virtuals, and no way for your own `User` model to talk to Better Auth's.
- **Broken `.populate()` and `_id` type mismatches:** when you `.populate()` a reference to a Better-Auth-created document, or try to line up your own `ObjectId` ref field against Better Auth's own ID handling, it silently breaks ([issue #6289](https://github.com/better-auth/better-auth/issues/6289), [discussion #9364](https://github.com/better-auth/better-auth/discussions/9364)).
- **The only "fix" is a manual workaround:** every answer on Better Auth's own Discord and discussions ([discussion #1921](https://github.com/better-auth/better-auth/discussions/1921)) is "reach into `mongoose.connection.getClient()` and hand the raw client to Better Auth," which sidesteps the schema/populate/validation problems entirely rather than solving them.

This package closes that gap: Better Auth's collections are real, registered Mongoose models, extensible the same way you'd extend any other model in your app.

## The proof

This isn't a claim. It's a real, passing test in this repo ([`test/populate.test.ts`](./test/populate.test.ts)):

```ts
const auth = betterAuth({ database: mongooseAdapter(connection) });

const { user } = await auth.api.signUpEmail({
  body: {
    email: "author@example.com",
    password: "correct-horse-battery-staple",
    name: "Post Author",
  },
});

// A consumer-defined model, with a real ObjectId ref to Better Auth's own "user" collection.
const Post = connection.model(
  "Post",
  new Schema({
    title: String,
    author: { type: Schema.Types.ObjectId, ref: "user", required: true },
  }),
);

await Post.create({ title: "Hello, populate()", author: coerceToObjectId(user.id) });

const post = await Post.findOne({ title: "Hello, populate()" }).populate("author").lean().exec();

post.author.email; // "author@example.com", resolved via plain Mongoose .populate(), no workaround
```

This also passes the official [`@better-auth/test-utils`](https://www.npmjs.com/package/@better-auth/test-utils) adapter contract suite. See [`test/adapter.test.ts`](./test/adapter.test.ts).

## Install

```bash
pnpm add better-auth-mongoose mongoose better-auth
```

`mongoose` and `better-auth` are peer dependencies. This package has zero direct dependencies of its own, and never pulls in the raw `mongodb` driver.

## Quick start

```ts
import { betterAuth } from "better-auth";
import { mongooseAdapter } from "better-auth-mongoose";
import mongoose, { Schema } from "mongoose";

await mongoose.connect(process.env.MONGO_URI!);

export const auth = betterAuth({
  database: mongooseAdapter(mongoose.connection, {
    // Extend the "user" model with your own fields, merged with whatever
    // fields Better Auth itself requires, not replacing them.
    schemas: {
      user: new Schema({
        role: { type: String, default: "member" },
        tenantId: { type: Schema.Types.ObjectId, ref: "Tenant" },
      }),
    },
  }),
  emailAndPassword: { enabled: true },
});
```

Your own code can then query the same `user` collection directly through Mongoose, with `.role` and `.tenantId` available like any other field:

```ts
const User = mongoose.model("user"); // already registered by mongooseAdapter()
const admins = await User.find({ role: "admin" }).lean();
```

## API reference

### `mongooseAdapter(connection, options?)`

```ts
function mongooseAdapter(connection: Connection, options?: MongooseAdapterOptions): AdapterFactory;
```

`connection` is a Mongoose `Connection` (e.g. `mongoose.connection`, or one returned by `mongoose.createConnection(...)`). This package never opens its own.

### `MongooseAdapterOptions`

| Option                | Type                              | Default | Description                                                                                                                                                                                                                                                                                                           |
| --------------------- | --------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usePlural`           | `boolean`                         | `false` | Use plural collection names, matching Better Auth's own `usePlural` convention.                                                                                                                                                                                                                                       |
| `schemas`             | `Partial<Record<string, Schema>>` | `{}`    | Per-model schema extensions, keyed by Better Auth's resolved model name (e.g. `"user"`, `"session"`, or a plugin-added model like `"organization"`). Merged with Better Auth's required fields: your fields are added, never dropped, and a required Better Auth field can't be accidentally loosened by your schema. |
| `adoptExistingModels` | `boolean`                         | `true`  | If a model with the given name is already registered on the connection (e.g. by your own app code, before `mongooseAdapter()` runs), adopt and extend it instead of building a fresh one.                                                                                                                             |
| `transactions`        | `boolean`                         | `true`  | Enable Better Auth's `experimental` transaction support via real Mongoose sessions. Automatically detects and gracefully degrades on a standalone (non-replica-set) MongoDB instance (see below).                                                                                                                     |
| `debugLogs`           | `boolean`                         | `false` | Forwarded to Better Auth's own adapter-factory debug logging.                                                                                                                                                                                                                                                         |

## Why your IDs are ObjectId hex strings, not Better Auth's default IDs

Better Auth's default ID generator produces a 32-character base62 string, not a valid `ObjectId`. This adapter overrides ID generation (via the documented `customIdGenerator` adapter-factory hook) to produce real 24-character `ObjectId` hex strings instead, and converts between `ObjectId` and `string` at the boundary (`customTransformInput`/`customTransformOutput`) so Better Auth's own core always sees plain strings while MongoDB stores real `ObjectId`s. This is what makes `.populate()` work against a consumer-defined `{ type: Schema.Types.ObjectId, ref: "user" }` field.

**If you override `advanced.database.generateId` yourself**, your replacement must also return valid `ObjectId`-compatible strings (24 hex characters). Otherwise this adapter falls back to storing your IDs as plain strings, which still works correctly for everything Better Auth does internally, but won't support `.populate()` against those specific documents from your own `ObjectId`-typed ref fields.

## Transactions

Enabled by default, using real Mongoose sessions (`connection.startSession()` + `session.withTransaction(...)`). Mongoose (and MongoDB itself) only supports sessions on a replica set or sharded cluster, not a standalone `mongod`, which is common in local dev. This adapter detects that automatically (a real session/transaction probe, not just an options check) and degrades gracefully to running non-transactionally rather than crashing on boot against a standalone instance.

```ts
mongooseAdapter(connection, { transactions: false }); // opt out entirely
```

## Joins

Better Auth 1.4+ supports adapter-level joins (`experimental: { joins: true }` in your `betterAuth()` config) for a documented 2–3x latency improvement on endpoints like `get-session` and `get-full-organization`. This adapter translates Better Auth's join config directly into Mongoose `.populate()` calls, no extra configuration needed once you enable the `experimental` flag on your Better Auth instance.

## Example app

[`examples/nestjs-mongoose`](../../examples/nestjs-mongoose) is a complete, runnable NestJS app using this adapter with an extended `user` schema and a `Post` model that `.populate()`s its author. It's exercised in CI, not just described in a README.

## Contributing

See the root [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

MIT © Ashwin Sathian
