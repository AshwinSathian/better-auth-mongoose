# better-auth-mongoose

[![CI](https://github.com/AshwinSathian/better-auth-mongoose/actions/workflows/ci.yml/badge.svg)](https://github.com/AshwinSathian/better-auth-mongoose/actions/workflows/ci.yml)
[![CodeQL](https://github.com/AshwinSathian/better-auth-mongoose/actions/workflows/codeql.yml/badge.svg)](https://github.com/AshwinSathian/better-auth-mongoose/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A Mongoose-native database adapter for [Better Auth](https://www.better-auth.com), plus an optional tenant-scoping plugin. Real, extensible Mongoose models for Better Auth's own tables — `.populate()`, schema validation, and hooks all work normally from your own application code, with no raw `mongodb` dependency.

> **This is a community project, not affiliated with or endorsed by the Better Auth team.** It exists to close a real, long-standing gap between Better Auth and Mongoose — see below.

## The problem

Better Auth's official MongoDB adapter talks to the raw [`mongodb`](https://www.npmjs.com/package/mongodb) driver, not [Mongoose](https://mongoosejs.com) — the standard ODM for Node + MongoDB, and close to universal in NestJS/Express backends. If your app already uses Mongoose, this creates real, documented problems that have been open on Better Auth's own GitHub since February 2025, with no first-party fix:

- A forced extra dependency on the raw `mongodb` driver ([issue #1492](https://github.com/better-auth/better-auth/issues/1492)).
- Two parallel connections to the same database, with no shared schema, validation, or hooks between Better Auth's own writes and your app's Mongoose models.
- Broken `.populate()` and `_id` type mismatches when your own code tries to reference a Better-Auth-created document ([issue #6289](https://github.com/better-auth/better-auth/issues/6289), [discussion #9364](https://github.com/better-auth/better-auth/discussions/9364)).
- The only answer offered in [discussion #1921](https://github.com/better-auth/better-auth/discussions/1921) and elsewhere is a manual workaround — reach into `mongoose.connection.getClient()` and hand the raw client to Better Auth — which sidesteps the schema/populate/validation problems rather than solving them.

`better-auth-mongoose` closes that gap properly: Better Auth's collections are real, registered Mongoose models, extensible the same way you'd extend any other model in your app. See the [package README](./packages/better-auth-mongoose#readme) for the full writeup and a real, passing test proving it.

## Packages in this repo

| Package                                                                 | Description                                                                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`better-auth-mongoose`](./packages/better-auth-mongoose)               | The Mongoose-native database adapter. Start here.                                                                                                                  |
| [`better-auth-mongoose-tenant`](./packages/better-auth-mongoose-tenant) | Optional tenant-scoped query middleware on top of Better Auth's `organization` plugin — automatic, not convention-based, tenant isolation for your own app models. |

## Quick start

```bash
pnpm add better-auth-mongoose mongoose better-auth
```

```ts
import { betterAuth } from "better-auth";
import { mongooseAdapter } from "better-auth-mongoose";
import mongoose, { Schema } from "mongoose";

await mongoose.connect(process.env.MONGO_URI!);

export const auth = betterAuth({
  database: mongooseAdapter(mongoose.connection, {
    schemas: {
      user: new Schema({ role: { type: String, default: "member" } }),
    },
  }),
});
```

Your own code then queries the same `user` collection through Mongoose directly, `.populate()` works against it from your own models, and `role` is just a normal field:

```ts
const Post = mongoose.model(
  "Post",
  new Schema({
    title: String,
    author: { type: Schema.Types.ObjectId, ref: "user" },
  }),
);

const post = await Post.findOne({ title: "..." }).populate("author"); // resolves — see below
```

## The differentiator, proven

This isn't a claim — it's a real, CI-run test:

- [`packages/better-auth-mongoose/test/populate.test.ts`](./packages/better-auth-mongoose/test/populate.test.ts) — the unit-level proof.
- [`examples/nestjs-mongoose`](./examples/nestjs-mongoose) — the same thing, end to end, inside a real NestJS app over real HTTP.

Both run on every push via [CI](./.github/workflows/ci.yml). `better-auth-mongoose` also passes the official [`@better-auth/test-utils`](https://www.npmjs.com/package/@better-auth/test-utils) adapter contract suite.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Please also read [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) and, for vulnerability reports, [SECURITY.md](./SECURITY.md).

## License

MIT © [Ashwin Sathian](https://github.com/AshwinSathian)
