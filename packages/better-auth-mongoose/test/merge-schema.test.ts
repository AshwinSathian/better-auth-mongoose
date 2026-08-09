import { describe, expect, it } from "vitest";
import { Schema } from "mongoose";
import { mergeSchema } from "../src/schema/merge-schema";
import type { DBFieldAttribute } from "@better-auth/core/db";

const requiredFields: Record<string, DBFieldAttribute> = {
  email: { type: "string", required: true, unique: true, fieldName: "email" },
  name: { type: "string", required: true, fieldName: "name" },
};

describe("mergeSchema", () => {
  it("builds a default schema from required fields when no consumer schema is given", () => {
    const schema = mergeSchema(requiredFields);
    expect(schema.path("email")).toBeDefined();
    expect(schema.path("name")).toBeDefined();
  });

  it("keeps every consumer field and backfills missing required fields", () => {
    const consumerSchema = new Schema({
      role: { type: String, default: "member" },
      tenantId: { type: Schema.Types.ObjectId, ref: "Tenant" },
    });

    const merged = mergeSchema(requiredFields, consumerSchema);

    expect(merged.path("role")).toBeDefined();
    expect(merged.path("tenantId")).toBeDefined();
    expect(merged.path("email")).toBeDefined();
    expect(merged.path("name")).toBeDefined();
  });

  it("does not let the consumer schema drop a required field even if it redefines it", () => {
    const consumerSchema = new Schema({
      email: { type: String, required: false }, // consumer tries to loosen it
    });

    const merged = mergeSchema(requiredFields, consumerSchema);

    expect((merged.path("email") as any).isRequired).toBe(true);
  });
});
