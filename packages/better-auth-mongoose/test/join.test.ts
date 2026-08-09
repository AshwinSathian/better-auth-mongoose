import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Schema, type Connection } from "mongoose";
import { createTestConnection, teardownTestConnection } from "./setup";
import { applyJoin } from "../src/join";
import { generateObjectIdString, coerceToObjectId } from "../src/id-mapping";
import type { JoinConfig } from "@better-auth/core/db/adapter";

let connection: Connection;
const identityGetFieldName = ({ field }: { model: string; field: string }) => field;

beforeAll(async () => {
  connection = await createTestConnection();
});

afterAll(async () => {
  await teardownTestConnection(connection);
});

describe("applyJoin", () => {
  it("resolves a referenced document via populate when a join config is given", async () => {
    const Author = connection.model(
      "JoinTestAuthor",
      new Schema({ _id: Schema.Types.ObjectId, name: String }),
    );
    const Post = connection.model(
      "JoinTestPost",
      new Schema({
        _id: Schema.Types.ObjectId,
        title: String,
        authorId: { type: Schema.Types.ObjectId, ref: "JoinTestAuthor" },
      }),
    );

    const authorId = generateObjectIdString();
    await Author.create({ _id: coerceToObjectId(authorId), name: "Ada" });
    await Post.create({
      _id: coerceToObjectId(generateObjectIdString()),
      title: "Hello",
      authorId: coerceToObjectId(authorId),
    });

    const join: JoinConfig = {
      JoinTestAuthor: { on: { from: "authorId", to: "id" }, relation: "one-to-one" },
    };

    const query = applyJoin(
      Post.findOne({ title: "Hello" }),
      join,
      "JoinTestPost",
      identityGetFieldName,
    );
    const result = await query.lean().exec();

    expect((result as any).authorId.name).toBe("Ada");
  });

  it("returns the query unchanged when no join is requested", async () => {
    const Post = connection.models.JoinTestPost;
    const query = Post.findOne({ title: "Hello" });
    const same = applyJoin(query, undefined, "JoinTestPost", identityGetFieldName);
    expect(same).toBe(query);
  });
});
