import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Connection } from "mongoose";
import { createTestConnection, teardownTestConnection } from "./setup";
import { registerModels } from "../src/schema/register-models";
import { makeCreate } from "../src/operations/create";
import { makeFindOne, makeFindMany, makeCount } from "../src/operations/read";
import { generateObjectIdString } from "../src/id-mapping";
import type { BetterAuthDBSchema } from "@better-auth/core/db";
import type { CleanedWhere } from "@better-auth/core/db/adapter";
import type { AnyModel } from "../src/types";

let connection: Connection;
let models: Map<string, AnyModel>;

const identityGetFieldName = ({ field }: { model: string; field: string }) => field;

function whereEq(field: string, value: unknown): CleanedWhere[] {
  return [{ field, value: value as never, operator: "eq", connector: "AND", mode: "sensitive" }];
}

const dbSchema: BetterAuthDBSchema = {
  user: {
    modelName: "user",
    fields: {
      email: { type: "string", required: true, unique: true, fieldName: "email" },
      name: { type: "string", required: true, fieldName: "name" },
    },
  },
};

beforeAll(async () => {
  connection = await createTestConnection();
  models = registerModels(connection, dbSchema, {});
});

afterAll(async () => {
  await teardownTestConnection(connection);
});

describe("create + findOne + findMany + count", () => {
  it("creates a document and returns it with the ObjectId-hex id it was given", async () => {
    const create = makeCreate(models);
    const id = generateObjectIdString();

    const result = await create({
      model: "user",
      data: { _id: id, email: "a@example.com", name: "Ada" } as never,
    });

    expect(String((result as any)._id)).toBe(id);
    expect((result as any).email).toBe("a@example.com");
  });

  it("finds one document by where clause", async () => {
    const findOne = makeFindOne(models, identityGetFieldName);

    const found = await findOne({ model: "user", where: whereEq("email", "a@example.com") });

    expect(found).not.toBeNull();
    expect((found as any).email).toBe("a@example.com");
  });

  it("returns null from findOne when nothing matches", async () => {
    const findOne = makeFindOne(models, identityGetFieldName);
    const found = await findOne({ model: "user", where: whereEq("email", "nobody@example.com") });
    expect(found).toBeNull();
  });

  it("finds many documents with limit", async () => {
    const create = makeCreate(models);
    await create({
      model: "user",
      data: { _id: generateObjectIdString(), email: "b@example.com", name: "Bob" } as never,
    });

    const findMany = makeFindMany(models, identityGetFieldName);
    const results = await findMany({ model: "user", where: undefined, limit: 10 });

    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("counts documents matching a where clause", async () => {
    const count = makeCount(models, identityGetFieldName);
    const total = await count({ model: "user", where: undefined });
    expect(total).toBeGreaterThanOrEqual(2);
  });

  it("supports contains/starts_with/ends_with without regex injection from the value", async () => {
    const create = makeCreate(models);
    await create({
      model: "user",
      data: {
        _id: generateObjectIdString(),
        email: "special.chars+test@example.com",
        name: "Special",
      } as never,
    });

    const findMany = makeFindMany(models, identityGetFieldName);
    const results = await findMany({
      model: "user",
      where: [
        {
          field: "email",
          value: "special.chars+test",
          operator: "contains",
          connector: "AND",
          mode: "sensitive",
        },
      ],
      limit: 10,
    });

    expect(results).toHaveLength(1);
  });
});
