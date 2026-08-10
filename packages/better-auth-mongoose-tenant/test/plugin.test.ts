import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose, { Schema, type Connection } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { tenantScoped } from "../src/plugin";

describe("tenantScoped", () => {
  it("returns a BetterAuthPlugin with a stable id", () => {
    const plugin = tenantScoped({
      scopedModels: ["Project"],
      getActiveTenantId: () => "tenant-a",
    });

    expect(plugin.id).toBe("mongoose-tenant-scoped");
  });

  it("throws a clear error from init() when a scoped model isn't registered yet", async () => {
    const plugin = tenantScoped({
      scopedModels: ["DoesNotExistModel"],
      getActiveTenantId: () => "tenant-a",
    });

    await expect(plugin.init?.({} as any)).rejects.toThrow(/DoesNotExistModel/);
  });
});

describe("tenantScoped with an explicit connection", () => {
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

  it("resolves scoped models from the provided connection instead of the global mongoose connection", async () => {
    const Ticket = connection.model(
      "ConnectionBoundTicket",
      new Schema({ title: String, organizationId: String }),
    );

    const plugin = tenantScoped({
      connection,
      scopedModels: ["ConnectionBoundTicket"],
      getActiveTenantId: () => "tenant-a",
    });
    await plugin.init?.({} as any);

    await Ticket.collection.insertMany([
      { title: "mine", organizationId: "tenant-a" },
      { title: "not mine", organizationId: "tenant-b" },
    ]);
    const found = await Ticket.find({}).lean().exec();
    expect(found).toHaveLength(1);
    expect((found[0] as any).title).toBe("mine");
  });

  it("throws a clear error naming the provided connection when the model isn't registered on it", async () => {
    const plugin = tenantScoped({
      connection,
      scopedModels: ["DoesNotExistOnThisConnection"],
      getActiveTenantId: () => "tenant-a",
    });

    await expect(plugin.init?.({} as any)).rejects.toThrow(/DoesNotExistOnThisConnection/);
  });
});
