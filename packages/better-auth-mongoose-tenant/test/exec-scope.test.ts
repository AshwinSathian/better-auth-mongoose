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

  it("does not let a chained .where().equals() override an already-scoped filter", async () => {
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
    expect(attempted).toHaveLength(1);
    expect((attempted[0] as any).name).toBe("mine");
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
});
