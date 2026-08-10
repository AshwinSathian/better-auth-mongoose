# better-auth-mongoose-tenant

Tenant-scoped query middleware for [Better Auth](https://www.better-auth.com)'s `organization` plugin, on top of [`better-auth-mongoose`](../better-auth-mongoose). Built _with_, not instead of, the `organization` plugin.

## What this adds

Better Auth's `organization` plugin gives you organizations, members, and an "active organization" on the session. It does not — and shouldn't, at the framework level — automatically scope your own app models (`Project`, `Invoice`, `Document`, whatever you have) to that active organization. Forgetting a `.where({ organizationId })` on one query path is exactly the kind of bug that leaks one tenant's data to another. `tenantScoped()` makes that scoping automatic instead of a convention every service method has to remember.

```ts
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { mongooseAdapter } from "better-auth-mongoose";
import { tenantScoped } from "better-auth-mongoose-tenant";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGO_URI!);

// Your own app models, defined however you already define them.
const Project = mongoose.model(
  "Project",
  new mongoose.Schema({
    name: String,
    organizationId: String,
  }),
);

export const auth = betterAuth({
  database: mongooseAdapter(mongoose.connection),
  plugins: [
    organization(),
    tenantScoped({
      scopedModels: ["Project"], // model names, already registered on the default mongoose connection
      getActiveTenantId: () => getCurrentSession()?.activeOrganizationId,
    }),
  ],
});
```

Once wired up, every read and write on `Project` gets automatically scoped: `.find()`, `.findOne()`, `.findById()`, `.findOneAndUpdate()`, `.findByIdAndUpdate()`, `.findOneAndDelete()`, `.findByIdAndDelete()`, `.findOneAndReplace()`, `.countDocuments()`, `.updateOne()`, `.updateMany()`, `.deleteOne()`, and `.deleteMany()` all get `{ organizationId: <active tenant> }` merged into their filter, so a caller-supplied `organizationId` can never override it. The id-based methods work the same way Mongoose implements them internally: as a lookup by `{ _id: id }` under the hood, so looking up another tenant's id returns `null`, the same as an id that doesn't exist at all. New documents get `organizationId` stamped on save if they don't already have one, and `.findOneAndReplace()`'s replacement document gets the same forced stamp (otherwise a full-document replace could silently drop the tenant field, or set a different one). There's no `.where()` to forget, and no method name that quietly slips past the net.

## API

### `tenantScoped(options)`

A Better Auth plugin (pass it in the `plugins` array).

```ts
interface TenantScopedOptions {
  /** Model names, already registered, to scope. */
  scopedModels: string[];
  /** Field holding the tenant id on each scoped model. Default: "organizationId". */
  tenantField?: string;
  /** Returns the active tenant id for the current request/session context. */
  getActiveTenantId: () => string | undefined;
  /** Connection scoped models are registered on. Default: the global mongoose connection. */
  connection?: Connection;
}
```

`getActiveTenantId` is called synchronously on every scoped query. Plug in whatever gives you the current request's `activeOrganizationId` (e.g. `AsyncLocalStorage`, a request-scoped container, or Better Auth's own session context, depending on your framework).

**Ordering matters:** `scopedModels` are looked up on the connection's model registry when the plugin's `init()` runs, so each scoped model must already be registered on that connection before `betterAuth({ plugins: [tenantScoped(...)] })` is constructed. By default that's the global `mongoose` connection (via `mongoose.model(...)`, or via `better-auth-mongoose`'s own registration for auth's own tables). If your app uses `mongoose.createConnection()` instead, pass that connection explicitly:

```ts
const connection = mongoose.createConnection(process.env.MONGO_URI!);
const Project = connection.model(
  "Project",
  new mongoose.Schema({ name: String, organizationId: String }),
);

tenantScoped({
  connection,
  scopedModels: ["Project"],
  getActiveTenantId: () => getCurrentSession()?.activeOrganizationId,
});
```

### `applyTenantScope(model, tenantField, getActiveTenantId)`

The lower-level function `tenantScoped()` calls internally, exported directly if you want to scope a model without going through the plugin system.

## Why a throw, not a silent fallback

If `getActiveTenantId()` returns `undefined` — no active tenant in the current context — a scoped query throws immediately, synchronously, before touching the database, rather than running unscoped (which would return every tenant's data) or returning an empty result (which would look like "no data" instead of "misconfigured request", masking real bugs). Fail loud and early beats fail silent and wide.

## Why method-wrapping instead of Mongoose middleware

`applyTenantScope` wraps the Model's own read/write methods (`find`, `findOne`, `findById`, `findOneAndUpdate`, `findByIdAndUpdate`, `findOneAndDelete`, `findByIdAndDelete`, `findOneAndReplace`, `countDocuments`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `save`) directly, rather than using `schema.pre(...)` hooks. Mongoose bakes document-level middleware (like `save`) into a Model at `mongoose.model()` compile time — hooks registered afterward are silently never called. Since scoped models are looked up by name _after_ they're already compiled (by your own app code, or by `better-auth-mongoose`), wrapping the compiled Model's own methods is what actually works regardless of registration order.

## The Mongo-specific active-organization bug: already fixed upstream

The original motivation for a `better-auth-mongoose-tenant` bug-fix component was [better-auth/better-auth#3695](https://github.com/better-auth/better-auth/issues/3695) ("Setting Active Organization not working with MongoDB"). Investigating it directly: **it's already fixed upstream**, resolved by [PR #3757](https://github.com/better-auth/better-auth/pull/3757) in August 2025, well before the `better-auth` versions this package targets. A direct reproduction attempt against this adapter turned up no error. No patch is needed or included here.

## License

MIT © Ashwin Sathian
