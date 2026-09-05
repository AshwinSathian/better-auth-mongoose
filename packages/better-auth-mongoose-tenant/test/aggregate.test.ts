import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose, { Schema, type Connection } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { applyTenantScope } from "../src/scoped-query";
import { tenantMatchStage, getScopedTenantId } from "../src/aggregate";

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

describe("tenantMatchStage", () => {
  it("builds a $match stage scoped to the active tenant", async () => {
    const activeTenantId = "tenant-a";
    const Widget = connection.model(
      "AggregateWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => activeTenantId);

    await Widget.collection.insertMany([
      { name: "mine-1", organizationId: "tenant-a" },
      { name: "mine-2", organizationId: "tenant-a" },
      { name: "theirs", organizationId: "tenant-b" },
    ]);

    const stage = tenantMatchStage(Widget);
    expect(stage).toEqual({ $match: { organizationId: "tenant-a" } });

    const rows = await Widget.aggregate([stage, { $sort: { name: 1 } }]);
    expect(rows.map((r: { name: string }) => r.name)).toEqual(["mine-1", "mine-2"]);
  });

  it("respects a custom tenantField", async () => {
    const Widget = connection.model(
      "AggregateCustomFieldWidget",
      new Schema({ name: String, accountId: String }),
    );
    applyTenantScope(Widget, "accountId", () => "account-1");

    const stage = tenantMatchStage(Widget);
    expect(stage).toEqual({ $match: { accountId: "account-1" } });
  });

  it("throws when the model isn't tenant-scoped at all", () => {
    const Widget = connection.model(
      "AggregateUnscopedWidget",
      new Schema({ name: String, organizationId: String }),
    );

    expect(() => tenantMatchStage(Widget)).toThrow(
      /tenantMatchStage\(\).*AggregateUnscopedWidget.*isn't tenant-scoped/i,
    );
  });

  it("throws when no active tenant id is available", () => {
    const Widget = connection.model(
      "AggregateNoTenantWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => undefined);

    expect(() => tenantMatchStage(Widget)).toThrow(/no active tenant id available/i);
  });

  it("never allows an aggregate pipeline to silently run unscoped", () => {
    // The whole point: a consumer who reaches for tenantMatchStage() but
    // forgot to actually wire up an active tenant gets a hard failure, not
    // an empty match ({}) that would look identical to "no rows" while
    // actually meaning "every row, unfiltered" if misused as `{ $match: {} }`.
    // Throws synchronously, before an aggregate pipeline is even built —
    // same fail-fast contract as the static-method layer for ordinary
    // queries, not a rejected promise from Model.aggregate() itself.
    const Widget = connection.model(
      "AggregateFailClosedWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => undefined);

    expect(() => Widget.aggregate([tenantMatchStage(Widget)])).toThrow(
      /no active tenant id available/i,
    );
  });
});

describe("getScopedTenantId", () => {
  it("returns the raw active tenant id", () => {
    const Widget = connection.model(
      "AggregateRawIdWidget",
      new Schema({ name: String, organizationId: String }),
    );
    applyTenantScope(Widget, "organizationId", () => "tenant-z");

    expect(getScopedTenantId(Widget)).toBe("tenant-z");
  });

  it("throws when the model isn't tenant-scoped", () => {
    const Widget = connection.model(
      "AggregateRawIdUnscopedWidget",
      new Schema({ name: String, organizationId: String }),
    );

    expect(() => getScopedTenantId(Widget)).toThrow(/getScopedTenantId\(\).*isn't tenant-scoped/i);
  });
});
