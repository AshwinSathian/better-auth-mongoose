import { Schema } from "mongoose";

// Extends Better Auth's own "user" fields with an app-specific one — proves
// G4 (schema extension) inside a real NestJS app, not just in a unit test.
export const userSchemaExtension = new Schema({
  role: { type: String, default: "member" },
});
