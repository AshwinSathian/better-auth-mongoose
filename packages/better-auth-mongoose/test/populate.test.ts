import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { betterAuth } from "better-auth";
import type { Connection } from "mongoose";
import { createTestConnection, teardownTestConnection } from "./setup";
import { mongooseAdapter } from "../src/adapter";
import { definePostModel } from "./fixtures/post";
import { coerceToObjectId } from "../src/id-mapping";

let connection: Connection;

beforeAll(async () => {
  connection = await createTestConnection();
});

afterAll(async () => {
  await teardownTestConnection(connection);
});

describe("the differentiator: a consumer's own model can .populate() a Better-Auth-created user", () => {
  it("resolves Post.author via .populate() after Better Auth creates the user", async () => {
    const auth = betterAuth({
      database: mongooseAdapter(connection),
      emailAndPassword: { enabled: true },
      secret: "test-secret-value-at-least-32-chars-long",
    });

    const { user } = await auth.api.signUpEmail({
      body: {
        email: "author@example.com",
        password: "correct-horse-battery-staple",
        name: "Post Author",
      },
    });

    const Post = definePostModel(connection);
    await Post.create({
      _id: coerceToObjectId(user.id),
      title: "Hello, populate()",
      author: coerceToObjectId(user.id),
    });

    const post = await Post.findOne({ title: "Hello, populate()" })
      .populate("author")
      .lean()
      .exec();

    expect((post as any).author).toBeDefined();
    expect((post as any).author._id.toString()).toBe(user.id);
    expect((post as any).author.email).toBe("author@example.com");
  });
});
