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

  it("uses fieldName as the schema path when it differs from the logical key", () => {
    // Better Auth's core renames data keys to fieldName (via getFieldName)
    // before this adapter ever sees them — the Mongoose path must match, or
    // every write silently drops the field once a consumer customizes it.
    const fields: Record<string, DBFieldAttribute> = {
      email: { type: "string", required: true, fieldName: "email_address" },
    };

    const def = buildSchemaDefinition(fields);

    expect(def.email_address).toMatchObject({ type: String, required: true });
    expect(def.email).toBeUndefined();
  });

  it("does not force ObjectId on a reference to a non-id field", () => {
    // Join keys aren't always the primary key — a reference to some other
    // field just holds a value of its own declared type, not an ObjectId.
    const fields: Record<string, DBFieldAttribute> = {
      oneToOne: {
        type: "string",
        required: true,
        fieldName: "oneToOne",
        references: { model: "user", field: "email", onDelete: "cascade" },
      },
    };

    const def = buildSchemaDefinition(fields);

    expect((def.oneToOne as any).type).toBe(String);
    expect((def.oneToOne as any).ref).toBeUndefined();
  });
});
