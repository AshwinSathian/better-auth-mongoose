import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Schema, type Connection } from "mongoose";
import { createTestConnection, teardownTestConnection } from "./setup";
import { whereToMongoFilter } from "../src/operations/read";

let connection: Connection;
const identityGetFieldName = ({ field }: { model: string; field: string }) => field;

beforeAll(async () => {
  connection = await createTestConnection();
});

afterAll(async () => {
  await teardownTestConnection(connection);
});

describe("whereToMongoFilter", () => {
  it("matches nothing for a case-insensitive `in` clause with an empty value list", async () => {
    const User = connection.model("WhereFilterInUser", new Schema({ email: String }));
    await User.create([{ email: "a@x.com" }, { email: "b@x.com" }, { email: "c@x.com" }]);

    const filter = whereToMongoFilter(
      User,
      "user",
      [{ field: "email", value: [], operator: "in", connector: "AND", mode: "insensitive" } as any],
      identityGetFieldName,
    );

    // Mapping zero elements through the insensitive per-value regex branch
    // would build `{ $or: [] }`, which this MongoDB version (and others)
    // treats as vacuously *true* — matching every document instead of none,
    // the opposite of what an empty allow-list should mean.
    const result = await User.find(filter).lean().exec();
    expect(result).toHaveLength(0);
  });

  it("still matches case-insensitively for a non-empty `in` list", async () => {
    const User = connection.model("WhereFilterInNonEmptyUser", new Schema({ email: String }));
    await User.create([{ email: "A@X.com" }, { email: "b@x.com" }]);

    const filter = whereToMongoFilter(
      User,
      "user",
      [
        {
          field: "email",
          value: ["a@x.com"],
          operator: "in",
          connector: "AND",
          mode: "insensitive",
        } as any,
      ],
      identityGetFieldName,
    );

    const result = await User.find(filter).lean().exec();
    expect(result).toHaveLength(1);
    expect((result[0] as any).email).toBe("A@X.com");
  });

  it("matches everything for a case-insensitive `not_in` clause with an empty value list", async () => {
    const User = connection.model("WhereFilterNotInUser", new Schema({ email: String }));
    await User.create([{ email: "a@x.com" }, { email: "b@x.com" }]);

    const filter = whereToMongoFilter(
      User,
      "user",
      [
        {
          field: "email",
          value: [],
          operator: "not_in",
          connector: "AND",
          mode: "insensitive",
        } as any,
      ],
      identityGetFieldName,
    );

    // Excluding zero values should exclude nothing.
    const result = await User.find(filter).lean().exec();
    expect(result).toHaveLength(2);
  });

  it("still excludes case-insensitively for a non-empty `not_in` list", async () => {
    const User = connection.model("WhereFilterNotInNonEmptyUser", new Schema({ email: String }));
    await User.create([{ email: "A@X.com" }, { email: "b@x.com" }]);

    const filter = whereToMongoFilter(
      User,
      "user",
      [
        {
          field: "email",
          value: ["a@x.com"],
          operator: "not_in",
          connector: "AND",
          mode: "insensitive",
        } as any,
      ],
      identityGetFieldName,
    );

    const result = await User.find(filter).lean().exec();
    expect(result).toHaveLength(1);
    expect((result[0] as any).email).toBe("b@x.com");
  });
});
