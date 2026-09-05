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
  await connection?.close();
  await mongod?.stop();
});

describe("exec-time enforcement", () => {
  it("scopes Model.where() chains, which never delegate to any wrapped static method", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "ExecScopedWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    await Widget.collection.insertMany([
      { name: "mine", organizationId: "tenant-a" },
      { name: "theirs", organizationId: "tenant-b" },
    ]);

    const found = await Widget.where({}).find().lean().exec();
    expect(found).toHaveLength(1);
    expect((found[0] as any).name).toBe("mine");
  });

  // The adversarial case this whole exec-time layer exists to stop: a
  // caller deliberately tries to read another tenant's row by chaining
  // .where(tenantField).equals(otherTenantId) onto an already-scoped call,
  // attempting to overwrite the filter this package injected before the
  // query executes. Both the static-method layer's own tenant value and
  // this chained override are present in the same query by the time it
  // runs; the exec-time layer must be the one that wins.
  it("defeats a deliberate .where(tenantField).equals(<other tenant>) attack on an already-scoped query", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "ExecScopedChainWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    await Widget.collection.insertMany([
      { name: "mine", organizationId: "tenant-a" },
      { name: "theirs", organizationId: "tenant-b" },
    ]);

    const attempted = await Widget.find({})
      .where("organizationId")
      .equals("tenant-b")
      .lean()
      .exec();

    // Not just "the attack didn't return tenant-b's row": assert exactly
    // what a correctly-scoped find({}) should return, so this test fails
    // if the attack ever succeeds even partially (e.g. an empty result
    // that looks safe but actually means the query broke instead of
    // staying correctly scoped to tenant-a).
    expect(attempted).toHaveLength(1);
    expect((attempted[0] as any).name).toBe("mine");
    expect((attempted[0] as any).organizationId).toBe("tenant-a");
  });

  // Query.prototype.cursor() (and `for await` on a Query directly, which
  // delegates to it via Symbol.asyncIterator) never calls Query.prototype
  // .exec() at all — QueryCursor reads the query's raw _conditions straight
  // against the driver, bypassing the round trip exec() normally makes.
  // Without its own patch, this streaming path fell through the exec-time
  // net entirely and reintroduced exactly the .where()-after-scoping attack
  // the previous test already defeats for the awaited/exec() path.
  it("defeats the .where(tenantField).equals(<other tenant>) attack via .cursor()", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "ExecScopedCursorWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    await Widget.collection.insertMany([
      { name: "mine", organizationId: "tenant-a" },
      { name: "theirs", organizationId: "tenant-b" },
    ]);

    const streamed: string[] = [];
    const cursor = Widget.find({}).where("organizationId").equals("tenant-b").cursor();
    for await (const doc of cursor) {
      streamed.push((doc as unknown as { name: string }).name);
    }

    expect(streamed).toEqual(["mine"]);
  });

  it("defeats the same attack via `for await` directly on a Query (Symbol.asyncIterator)", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "ExecScopedAsyncIteratorWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    await Widget.collection.insertMany([
      { name: "mine", organizationId: "tenant-a" },
      { name: "theirs", organizationId: "tenant-b" },
    ]);

    const streamed: string[] = [];
    for await (const doc of Widget.find({}).where("organizationId").equals("tenant-b")) {
      streamed.push((doc as unknown as { name: string }).name);
    }

    expect(streamed).toEqual(["mine"]);
  });

  it("still streams correctly-scoped results via a plain .cursor() with no attack", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "ExecScopedPlainCursorWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    await Widget.collection.insertMany([
      { name: "mine", organizationId: "tenant-a" },
      { name: "theirs", organizationId: "tenant-b" },
    ]);

    const streamed: string[] = [];
    for await (const doc of Widget.find({}).cursor()) {
      streamed.push((doc as unknown as { name: string }).name);
    }

    expect(streamed).toEqual(["mine"]);
  });

  it("surfaces a missing active tenant id through the cursor's error path, not a synchronous throw", async () => {
    const Widget = connection.model(
      "ExecScopedCursorNoTenantWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => undefined);

    // Widget.find({}) is wrapped as a static and would throw synchronously
    // right there (before a Query even exists), which isn't what this test
    // is after. Widget.where({}) builds a Query directly without going
    // through that wrapper, so enforcement only happens once .cursor() runs
    // — exactly the path being tested here.
    //
    // Mirrors Mongoose's own cast-error convention: cursor() always returns
    // a cursor object rather than throwing synchronously, even when
    // enforcement can't proceed. The error must still surface once consumed.
    const cursor = Widget.where({}).cursor();
    await expect(
      (async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _doc of cursor) {
          // draining is enough to observe the rejection
        }
      })(),
    ).rejects.toThrow(/no active tenant id available/i);
  });

  it("scopes the standalone Model.replaceOne(), which isn't wrapped as a static at all", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "ExecScopedReplaceWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    await Widget.collection.insertMany([
      { name: "mine", organizationId: "tenant-a" },
      { name: "theirs", organizationId: "tenant-b" },
    ]);

    // A filter matching another tenant's row must not be replaceable.
    await Widget.replaceOne({ name: "theirs" }, { name: "hijacked" });
    expect(await Widget.collection.countDocuments({ name: "theirs" })).toBe(1);

    // The replacement document itself must also get the tenant field forced
    // on, the same way findOneAndReplace's replacement does, so a replace
    // can't omit or override it.
    await Widget.replaceOne({ name: "mine" }, { name: "replaced", organizationId: "tenant-b" });
    const replaced = await Widget.collection.findOne({ name: "replaced" });
    expect(replaced?.organizationId).toBe("tenant-a");
  });

  it("does not let an update body reassign a row to a different tenant via $set", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "ExecScopedHijackWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    await Widget.collection.insertOne({ name: "mine", organizationId: "tenant-a" });

    await Widget.updateOne({ name: "mine" }, { $set: { organizationId: "tenant-b" } });
    const row = await Widget.collection.findOne({ name: "mine" });
    expect(row?.organizationId).toBe("tenant-a");
  });

  it("does not let an update body strip the tenant field via $unset", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "ExecScopedUnsetWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    await Widget.collection.insertOne({ name: "mine", organizationId: "tenant-a" });

    await Widget.updateOne({ name: "mine" }, { $unset: { organizationId: "" } });
    const row = await Widget.collection.findOne({ name: "mine" });
    expect(row?.organizationId).toBe("tenant-a");
  });

  // Model.exists() is deliberately not in scoped-query.ts's static-method
  // list; it's classified as "covered by exec-time enforcement" on the
  // reasoning that its underlying Query carries op "findOne" (Model.exists
  // is implemented as `this.findOne(filter).select({_id:1}).lean()`), which
  // is already in exec-scope.ts's FILTER_ONLY_OPS. That reasoning is worth
  // a real test, not just a comment: if a future Mongoose version ever
  // tagged exists() with its own distinct op string instead of "findOne",
  // the fail-closed unknown-op guard would make every exists() call on a
  // scoped model throw, a broken feature rather than a leak, but still a
  // regression this test exists to catch immediately.
  it("scopes Model.exists() by tenant, since its query executes with op findOne", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "ExecScopedExistsWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    await Widget.collection.insertMany([
      { name: "mine", organizationId: "tenant-a" },
      { name: "theirs", organizationId: "tenant-b" },
    ]);

    await expect(Widget.exists({ name: "mine" })).resolves.not.toBeNull();
    // A caller-supplied filter matching another tenant's row must not
    // report that row as existing.
    await expect(Widget.exists({ name: "theirs" })).resolves.toBeNull();
  });

  it("throws from estimatedDocumentCount() instead of silently counting every tenant's documents", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "ExecScopedEstimateWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    await Widget.collection.insertMany([
      { name: "mine", organizationId: "tenant-a" },
      { name: "theirs", organizationId: "tenant-b" },
    ]);

    await expect(Widget.estimatedDocumentCount().exec()).rejects.toThrow(
      /estimatedDocumentCount.*has no filter/i,
    );
  });

  it("refuses to execute a query op it doesn't recognize, rather than running it unscoped", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "ExecScopedUnknownOpWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    const query = Widget.find({});
    // Simulates a future Mongoose version introducing a Query op this
    // package doesn't know about yet: the defense-in-depth default-deny
    // path, not something reachable through today's public API.
    (query as unknown as { op: string }).op = "someFutureMongooseOp";
    await expect(query.exec()).rejects.toThrow(/don't know how to safely scope/i);
  });

  it("throws from a direct bulkWrite() call instead of leaving it silently unscoped", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "ExecScopedBulkWriteWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    await expect(
      Widget.bulkWrite([{ insertOne: { document: { name: "sneaky" } } }]),
    ).rejects.toThrow(/bulkWrite\(\).*not scoped/i);
  });

  it("still lets bulkSave() call the true bulkWrite() internally despite the guard on direct calls", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "ExecScopedBulkSaveThroughGuardWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    // bulkSave() delegates to bulkWrite() internally via dynamic `this`
    // dispatch. If the bulkWrite guard broke that delegation, this would
    // throw the same "not scoped" error a direct call gets, instead of
    // actually persisting.
    await Widget.bulkSave([new Widget({ name: "via bulkSave" })]);
    const row = await Widget.collection.findOne({ name: "via bulkSave" });
    expect(row?.organizationId).toBe("tenant-a");
  });

  // count()/findOneAndRemove()/findByIdAndRemove()/remove()/update() only
  // exist pre-Mongoose-9 (this package's own pinned devDependency doesn't
  // have them), so these are feature-detected rather than assumed present.
  // They still run for real in the Mongoose 6/7/8 compatibility CI job,
  // which installs real older majors that do have them.
  it("scopes the legacy count/findOneAndRemove/findByIdAndRemove/remove/update methods where present", async () => {
    const activeTenantId = "tenant-a";
    const RealWidget = connection.model(
      "ExecScopedLegacyOpsWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(RealWidget, "organizationId", () => activeTenantId);
    // Not present in this package's own pinned Mongoose 9 types at all, so
    // cast once here rather than scattering `as unknown as ...` everywhere
    // a legacy method gets called below.

    const Widget = RealWidget as any;

    await Widget.collection.insertMany([
      { name: "mine", organizationId: "tenant-a" },
      { name: "theirs", organizationId: "tenant-b" },
    ]);

    if (typeof Widget.count === "function") {
      await expect(Widget.count({}).exec()).resolves.toBe(1);
    }
    if (typeof Widget.findOneAndRemove === "function") {
      await expect(Widget.findOneAndRemove({ name: "theirs" }).exec()).resolves.toBeNull();
    }
    if (typeof Widget.remove === "function") {
      await Widget.remove({}).exec();
      const remaining = await Widget.collection.countDocuments({ organizationId: "tenant-b" });
      expect(remaining).toBe(1);
    }
    if (typeof Widget.update === "function") {
      await Widget.collection.insertOne({ name: "for-update", organizationId: "tenant-a" });
      await Widget.update({ name: "for-update" }, { $set: { organizationId: "tenant-b" } }).exec();
      const row = await Widget.collection.findOne({ name: "for-update" });
      expect(row?.organizationId).toBe("tenant-a");
    }
  });
});
