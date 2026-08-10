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

  it("throws instead of silently querying across tenants when no active tenant id is available", () => {
    const Doc2 = connection.model(
      "ScopedDoc2",
      new Schema({ title: String, organizationId: String }),
    );
    applyTenantScope(Doc2, "organizationId", () => undefined);

    // Fails fast, synchronously, before a query is even constructed — safer
    // than letting a partially-built (unscoped) query reach the database.
    expect(() => Doc2.find({})).toThrow(/no active tenant/i);
  });

  it("scopes deleteOne/deleteMany/updateOne/updateMany so a broad filter can't touch another tenant's rows", async () => {
    let activeTenantId = "tenant-a";
    const Task = connection.model(
      "ScopedTask",
      new Schema({ title: String, organizationId: String }),
    );
    applyTenantScope(Task, "organizationId", () => activeTenantId);

    await Task.collection.insertMany([
      { title: "A1", organizationId: "tenant-a" },
      { title: "A2", organizationId: "tenant-a" },
      { title: "B1", organizationId: "tenant-b" },
    ]);

    // Cross-tenant assertions below deliberately go through the raw driver
    // collection, not the scoped Model — the scoped Model is *incapable* of
    // ever returning tenant-b's data by design, so it can't be used to
    // check tenant-b's state without itself being silently re-scoped to
    // tenant-a (exactly the bug this test would otherwise hide).

    // A blanket updateMany({}, ...) must only touch the active tenant's rows.
    await Task.updateMany({}, { $set: { title: "updated" } });
    expect(
      await Task.collection.countDocuments({ organizationId: "tenant-a", title: "updated" }),
    ).toBe(2);
    expect((await Task.collection.findOne({ organizationId: "tenant-b" }))?.title).toBe("B1");

    // A blanket deleteOne({}) must not remove another tenant's row.
    await Task.deleteOne({});
    expect(await Task.collection.countDocuments({ organizationId: "tenant-a" })).toBe(1);
    expect(await Task.collection.countDocuments({ organizationId: "tenant-b" })).toBe(1);

    // A blanket deleteMany({}) must never wipe every tenant's data.
    await Task.deleteMany({});
    expect(await Task.collection.countDocuments({ organizationId: "tenant-a" })).toBe(0);
    expect(await Task.collection.countDocuments({ organizationId: "tenant-b" })).toBe(1);

    activeTenantId = "tenant-b";
    expect(await Task.countDocuments({})).toBe(1);
  });

  it("scopes findOneAndDelete and findOneAndReplace", async () => {
    const activeTenantId = "tenant-a";
    const Note = connection.model(
      "ScopedNote",
      new Schema({ body: String, organizationId: String }),
    );
    applyTenantScope(Note, "organizationId", () => activeTenantId);

    await Note.collection.insertMany([
      { body: "mine", organizationId: "tenant-a" },
      { body: "not mine", organizationId: "tenant-b" },
    ]);

    // A filter matching another tenant's row must find nothing to replace/delete.
    expect(await Note.findOneAndReplace({ body: "not mine" }, { body: "hijacked" })).toBeNull();
    expect(await Note.findOneAndDelete({ body: "not mine" })).toBeNull();
    expect(await Note.collection.countDocuments({ organizationId: "tenant-b" })).toBe(1);

    const replaced = await Note.findOneAndReplace(
      { body: "mine" },
      { body: "replaced" },
      { returnDocument: "after" },
    );
    expect(replaced?.get("body")).toBe("replaced");
    expect(replaced?.get("organizationId")).toBe("tenant-a");
  });

  it("scopes findById, findByIdAndUpdate, and findByIdAndDelete by tenant", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "ScopedWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    const mine = await Widget.collection.insertOne({ name: "mine", organizationId: "tenant-a" });
    const theirs = await Widget.collection.insertOne({
      name: "theirs",
      organizationId: "tenant-b",
    });

    // A caller-supplied id belonging to another tenant must come back empty,
    // not the other tenant's document.
    expect((await Widget.findById(mine.insertedId))?.get("name")).toBe("mine");
    expect(await Widget.findById(theirs.insertedId)).toBeNull();

    expect(
      (await Widget.findByIdAndUpdate(mine.insertedId, { name: "renamed" }, { new: true }))?.get(
        "name",
      ),
    ).toBe("renamed");
    expect(await Widget.findByIdAndUpdate(theirs.insertedId, { name: "hijacked" })).toBeNull();
    expect((await Widget.collection.findOne({ _id: theirs.insertedId }))?.name).toBe("theirs");

    expect(await Widget.findByIdAndDelete(theirs.insertedId)).toBeNull();
    expect(await Widget.collection.countDocuments({ _id: theirs.insertedId })).toBe(1);

    const deletedMine = await Widget.findByIdAndDelete(mine.insertedId);
    expect(deletedMine?.get("name")).toBe("renamed");
    expect(await Widget.collection.countDocuments({ _id: mine.insertedId })).toBe(0);
  });

  it("does not re-wrap an already-scoped model on a second applyTenantScope() call", async () => {
    let calls = 0;
    const getActiveTenantId = () => {
      calls++;
      return "tenant-a";
    };
    const Ledger = connection.model(
      "ScopedLedger",
      new Schema({ amount: Number, organizationId: String }),
    );

    applyTenantScope(Ledger, "organizationId", getActiveTenantId);
    applyTenantScope(Ledger, "organizationId", getActiveTenantId);

    await Ledger.collection.insertOne({ amount: 1, organizationId: "tenant-a" });

    calls = 0;
    await Ledger.find({}).lean().exec();
    // A single wrap calls getActiveTenantId once per query; an undetected
    // second wrap would call it twice for the same find().
    expect(calls).toBe(1);
  });
});
