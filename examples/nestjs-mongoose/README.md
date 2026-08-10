# NestJS + Mongoose + better-auth-mongoose

A complete, runnable example demonstrating this repo's core claim inside a real NestJS app: an extended `user` schema (G4) and a `Post` model whose `author` reference `.populate()`s a Better-Auth-created user (G2), through the standard NestJS auth integration ([`@thallesp/nestjs-better-auth`](https://github.com/thallesp/nestjs-better-auth)).

## What's here

- [`src/auth/`](./src/auth): Better Auth wired up with `mongooseAdapter()`, extending the `user` model with a `role` field via `schemas.user`.
- [`src/posts/`](./src/posts): a `Post` model with `author: { type: Schema.Types.ObjectId, ref: "user" }`, a `PostsService` that creates/reads posts, and a `PostsController` exposing them over HTTP.
- [`test/app.e2e-spec.ts`](./test/app.e2e-spec.ts): signs a user up over real HTTP, creates a post as that authenticated user, fetches it back, and asserts the populated `author.email` matches. This runs in CI on every push (see the root [`ci.yml`](../../.github/workflows/ci.yml)), so it's not just a README claim.

## Running it

Requires a local MongoDB **replica set** (transactions need one; see the root package's README) or adjust `MONGO_URI` to point at one you have running:

```bash
pnpm install
MONGO_URI="mongodb://127.0.0.1:27017/nestjs-mongoose-example" pnpm --filter nestjs-mongoose-example start
```

Then, from another terminal:

```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"correct-horse-battery-staple","name":"You"}' \
  -c cookies.txt

curl -X POST http://localhost:3000/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"title":"Hello"}'

curl http://localhost:3000/posts/<id-from-the-previous-response>
```

The last response includes a fully-populated `author` object: a real Mongoose `.populate()` result, resolved against a document Better Auth itself created.

## Running the test without any manual setup

```bash
pnpm --filter nestjs-mongoose-example test:e2e
```

Spins up an in-memory MongoDB replica set ([`mongodb-memory-server`](https://github.com/typegoose/mongodb-memory-server)) automatically. No external database needed.

## Notable wiring details

- **`bodyParser: false`** in `main.ts`: required by `@thallesp/nestjs-better-auth`, which installs its own body parsing so Better Auth's handler sees the raw request body.
- **`AuthModule.forRootAsync()`** in `app.module.ts`: connects Mongoose and constructs the `betterAuth()` instance inside the factory, since establishing a database connection is inherently asynchronous.
- **Vitest + SWC** (`.swcrc`, `vitest.config.ts`): NestJS's dependency injection relies on TypeScript's `emitDecoratorMetadata`, which Vitest's default esbuild transform doesn't support. This is the [officially documented NestJS + Vitest setup](https://docs.nestjs.com/recipes/swc#vitest), not something specific to this example.

## License

MIT © Ashwin Sathian
