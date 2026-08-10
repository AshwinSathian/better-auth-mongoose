# better-auth-mongoose-tenant

Tenant-scoped query middleware for [Better Auth](https://www.better-auth.com)'s `organization` plugin, on top of [`better-auth-mongoose`](../better-auth-mongoose). Built _with_, not instead of, the `organization` plugin.

## What this adds

Better Auth's `organization` plugin gives you organizations, members, and an "active organization" on the session. It does not, and shouldn't, at the framework level, automatically scope your own app models (`Project`, `Invoice`, `Document`, whatever you have) to that active organization. Forgetting a `.where({ organizationId })` on one query path is exactly the kind of bug that leaks one tenant's data to another. `tenantScoped()` makes that scoping automatic instead of a convention every service method has to remember.

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

Once wired up, every read and write on `Project` gets automatically scoped: `.find()`, `.findOne()`, `.findById()`, `.findOneAndUpdate()`, `.findByIdAndUpdate()`, `.findOneAndDelete()`, `.findByIdAndDelete()`, `.findOneAndReplace()`, `.replaceOne()`, `.countDocuments()`, `.distinct()`, `.exists()`, `.updateOne()`, `.updateMany()`, and `.deleteOne()`/`.deleteMany()` all get `{ organizationId: <active tenant> }` merged into their filter, so a caller-supplied `organizationId` can never override it, and neither can chaining `.where('organizationId').equals(...)` onto the result afterward. The id-based methods work the same way Mongoose implements them internally: as a lookup by `{ _id: id }` under the hood, so looking up another tenant's id returns `null`, the same as an id that doesn't exist at all. New documents get `organizationId` stamped whether they're created via `new Project().save()`, `Project.create()`, `Project.insertOne()`, `Project.insertMany()`, or `Project.bulkSave()`, and any full-document replace (`.findOneAndReplace()`, `.replaceOne()`) gets the same forced stamp on the replacement, so it can't silently drop the tenant field or move a row to another tenant. An update body can't reassign a row to a different tenant via `$set`, or strip the field via `$unset`, either. There's no `.where()` to forget, and no method name that quietly slips past the net.

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

If `getActiveTenantId()` returns `undefined` (no active tenant in the current context), a scoped query throws immediately, synchronously, before touching the database, rather than running unscoped (which would return every tenant's data) or returning an empty result (which would look like "no data" instead of "misconfigured request", masking real bugs). Fail loud and early beats fail silent and wide.

## Two enforcement layers, not one

`applyTenantScope` works in two independent layers, because neither one alone covers everything:

1. **Static-method wrapping.** `find`, `findOne`, `findById`, `findOneAndUpdate`, `findByIdAndUpdate`, `findOneAndDelete`, `findByIdAndDelete`, `findOneAndReplace`, `countDocuments`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `insertMany`, `bulkSave`, and both `save`/`$save` on the document prototype are reassigned directly on the compiled Model, rather than via `schema.pre(...)` hooks. Mongoose bakes document-level middleware like `save` into a Model at `mongoose.model()` compile time, so hooks registered afterward are silently never called, and scoped models here are always looked up by name after they're already compiled. This layer throws immediately and synchronously on a missing active tenant, before a query is even built.
2. **Exec-time enforcement.** Some methods don't go through any of the above at all: `Model.where()` builds a `Query` directly instead of delegating to a wrapped static, `Model.replaceOne()` (the standalone static, distinct from `findOneAndReplace`) is never wrapped, and chaining `.where('organizationId').equals(...)` after an already-scoped call can overwrite the filter the first layer injected before the query executes. `applyTenantScope` also patches `Query.prototype.exec` once, module-wide, to force the tenant field onto every query built against a scoped model at the last possible moment. This covers `.where()` chains, `replaceOne`, `distinct`, `exists`, and closes off post-hoc overrides on everything else, regardless of how the query was constructed. The patch is a no-op for every other model in the process; it only acts on queries whose model carries this package's scope marker.

Both layers run for anything the first one wraps: redundant there by design, and load-bearing for everything the first one can't reach.

## What's not scoped, and why

A few Model methods are deliberately left unscoped rather than half-solved:

- **`estimatedDocumentCount()`** has no filter concept at all. It reads fast collection-level metadata, not a filtered query, so it can't be scoped by tenant. Calling it on a scoped model throws rather than silently returning every tenant's count; use `countDocuments({})` instead, which is scoped.
- **`bulkWrite()`** takes heterogeneous, driver-shaped raw operations. `bulkSave()` (which is scoped) calls `bulkWrite()` internally, so `bulkWrite` itself is left unwrapped rather than guarded. A guard here would also break `bulkSave`'s own delegation. If you need bulk writes against a scoped model directly, scope each operation's filter/document yourself.
- **`aggregate()`** is pipeline-based, not filter-based. Scoping it generically would mean prepending a `$match` stage, which changes pipeline semantics in ways too specific to your own pipeline to do safely without knowing what it does.
- **`watch()`** is a change-stream subscription, not a query.
- **`populate()`** and **`hydrate()`** operate on already-fetched data or plain objects; neither makes its own database round trip, so there's nothing to scope.

## The Mongo-specific active-organization bug: already fixed upstream

The original motivation for a `better-auth-mongoose-tenant` bug-fix component was [better-auth/better-auth#3695](https://github.com/better-auth/better-auth/issues/3695) ("Setting Active Organization not working with MongoDB"). Investigating it directly: **it's already fixed upstream**, resolved by [PR #3757](https://github.com/better-auth/better-auth/pull/3757) in August 2025, well before the `better-auth` versions this package targets. A direct reproduction attempt against this adapter turned up no error. No patch is needed or included here.

## License

MIT © Ashwin Sathian
