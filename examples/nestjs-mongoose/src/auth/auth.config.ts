import { betterAuth } from "better-auth";
import { mongooseAdapter } from "better-auth-mongoose";
import type { Connection } from "mongoose";
import { userSchemaExtension } from "./user-schema-extension";

export function createAuth(connection: Connection) {
  return betterAuth({
    database: mongooseAdapter(connection, {
      schemas: { user: userSchemaExtension },
    }),
    emailAndPassword: { enabled: true },
    secret: process.env.BETTER_AUTH_SECRET ?? "example-only-secret-do-not-use-in-production-32",
    basePath: "/api/auth",
  });
}
