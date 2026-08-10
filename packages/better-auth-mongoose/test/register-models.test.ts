import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose, { Schema, type Connection } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { registerModels } from "../src/schema/register-models";
import type { BetterAuthDBSchema } from "@better-auth/core/db";

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

const dbSchema: BetterAuthDBSchema = {
  user: {
    modelName: "user",
    fields: {
      email: { type: "string", required: true, unique: true, fieldName: "email" },
      name: { type: "string", required: true, fieldName: "name" },
    },
  },
};

describe("registerModels", () => {
  it("registers a default Mongoose model per Better Auth model when no consumer schema exists", () => {
    const models = registerModels(connection, dbSchema, {});
    expect(models.get("user")).toBeDefined();
    expect(models.get("user")!.schema.path("email")).toBeDefined();
  });

  it("adopts an already-registered consumer model instead of overwriting it", () => {
    const conn2 = connection.useDb("adopt-test");
    conn2.model("user", new Schema({ role: { type: String, default: "member" } }));

    const models = registerModels(conn2, dbSchema, { adoptExistingModels: true });

    expect(models.get("user")!.schema.path("role")).toBeDefined();
    expect(models.get("user")!.schema.path("email")).toBeDefined(); // backfilled
  });

  it("respects options.schemas overrides even when no model is pre-registered", () => {
    const conn3 = connection.useDb("schemas-option-test");
    const userExtension = new Schema({ tenantId: { type: Schema.Types.ObjectId, ref: "Tenant" } });

    const models = registerModels(conn3, dbSchema, { schemas: { user: userExtension } });

    expect(models.get("user")!.schema.path("tenantId")).toBeDefined();
    expect(models.get("user")!.schema.path("email")).toBeDefined();
  });

  it("rebuilds the model when only a field's index flag changes", () => {
    const conn4 = connection.useDb("index-signature-test");
    const withoutIndex: BetterAuthDBSchema = {
      user: {
        modelName: "user",
        fields: { bio: { type: "string", required: false, fieldName: "bio" } },
      },
    };
    const withIndex: BetterAuthDBSchema = {
      user: {
        modelName: "user",
        fields: { bio: { type: "string", required: false, fieldName: "bio", index: true } },
      },
    };

    registerModels(conn4, withoutIndex, {});
    const rebuilt = registerModels(conn4, withIndex, {});

    const indexedPaths = rebuilt
      .get("user")!
      .schema.indexes()
      .map(([fields]) => Object.keys(fields as Record<string, unknown>)[0]);
    expect(indexedPaths).toContain("bio");
  });
});
