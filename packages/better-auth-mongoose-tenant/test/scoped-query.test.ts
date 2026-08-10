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
});
