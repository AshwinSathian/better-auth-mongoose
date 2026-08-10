import { describe, expect, it } from "vitest";
import { makeCreateSchema } from "../src/create-schema";
import type { BetterAuthDBSchema } from "@better-auth/core/db";

describe("makeCreateSchema", () => {
  it("emits a Schema.Types.ObjectId ref for a reference-to-id field, and plain types otherwise", async () => {
    const createSchema = makeCreateSchema();
    const tables: BetterAuthDBSchema = {
      user: {
        modelName: "user",
        fields: {
          name: { type: "string", required: true, fieldName: "name" },
          age: { type: "number", required: false, fieldName: "age" },
          verified: { type: "boolean", required: true, fieldName: "verified" },
          userId: {
            type: "string",
            required: true,
            fieldName: "userId",
            references: { model: "user", field: "id", onDelete: "cascade" },
          },
        },
      },
    };

    const result = await createSchema({ tables });

    expect(result.code).toContain('import { Schema } from "mongoose";');
    expect(result.code).toContain("export const userSchema = new Schema({");
    expect(result.code).toContain("name: { type: String, required: true }");
    expect(result.code).toContain("age: { type: Number, required: false }");
    expect(result.code).toContain("verified: { type: Boolean, required: true }");
    expect(result.code).toContain(
      'userId: { type: Schema.Types.ObjectId, ref: "user", required: true }',
    );
  });

  it("inlines a function defaultValue as real source, instead of dropping it as `default: undefined`", async () => {
    const createSchema = makeCreateSchema();
    const tables: BetterAuthDBSchema = {
      session: {
        modelName: "session",
        fields: {
          createdAt: {
            type: "date",
            required: true,
            fieldName: "createdAt",
            defaultValue: () => new Date(),
          },
        },
      },
    };

    const result = await createSchema({ tables });

    // The exact serialized form of the arrow function depends on how the
    // test file itself was transformed (e.g. esbuild's `/* @__PURE__ */`
    // annotations) — assert on the invariant this fix actually guarantees:
    // the generator's real source survives, rather than a JSON.stringify(fn)
    // "undefined".
    expect(result.code).not.toContain("default: undefined");
    expect(result.code).toMatch(/default: \(\) => .*new Date\(\)/);
  });

  it("uses the file path when given, and a sensible default otherwise", async () => {
    const createSchema = makeCreateSchema();
    const tables: BetterAuthDBSchema = {
      user: {
        modelName: "user",
        fields: { name: { type: "string", required: true, fieldName: "name" } },
      },
    };

    expect((await createSchema({ tables })).path).toBe("./better-auth-mongoose-schemas.ts");
    expect((await createSchema({ tables, file: "./custom-path.ts" })).path).toBe(
      "./custom-path.ts",
    );
  });
});
