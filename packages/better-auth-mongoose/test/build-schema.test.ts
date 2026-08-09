import { describe, expect, it } from "vitest";
import { Schema } from "mongoose";
import { buildSchemaDefinition } from "../src/schema/build-schema";
import type { DBFieldAttribute } from "@better-auth/core/db";

describe("buildSchemaDefinition", () => {
  it("maps string/number/boolean/date field types to Mongoose types", () => {
    const fields: Record<string, DBFieldAttribute> = {
      name: { type: "string", required: true, fieldName: "name" },
      age: { type: "number", required: false, fieldName: "age" },
      verified: { type: "boolean", required: true, fieldName: "verified" },
      createdAt: { type: "date", required: true, fieldName: "createdAt" },
    };

    const def = buildSchemaDefinition(fields);

    expect(def.name).toMatchObject({ type: String, required: true });
    expect(def.age).toMatchObject({ type: Number, required: false });
    expect(def.verified).toMatchObject({ type: Boolean, required: true });
    expect(def.createdAt).toMatchObject({ type: Date, required: true });
  });

  it("marks unique fields and applies defaultValue", () => {
    const fields: Record<string, DBFieldAttribute> = {
      email: { type: "string", required: true, unique: true, fieldName: "email" },
      role: {
        type: "string",
        required: true,
        fieldName: "role",
        defaultValue: "member",
      },
    };

    const def = buildSchemaDefinition(fields);

    expect(def.email).toMatchObject({ unique: true });
    expect(def.role).toMatchObject({ default: "member" });
  });

  it("maps reference fields to ObjectId with a ref", () => {
    const fields: Record<string, DBFieldAttribute> = {
      userId: {
        type: "string",
        required: true,
        fieldName: "userId",
        references: { model: "user", field: "id", onDelete: "cascade" },
      },
    };

    const def = buildSchemaDefinition(fields);

    // Mongoose SchemaTypeOptions store the constructor under `.type`
    expect((def.userId as any).type).toBe(Schema.Types.ObjectId);
    expect((def.userId as any).ref).toBe("user");
  });
});
