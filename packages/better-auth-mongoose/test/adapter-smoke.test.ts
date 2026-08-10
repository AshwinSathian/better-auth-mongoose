import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { betterAuth } from "better-auth";
import type { Connection } from "mongoose";
import { createTestConnection, teardownTestConnection } from "./setup";
import { mongooseAdapter } from "../src/adapter";
import { generateObjectIdString } from "../src/id-mapping";

let connection: Connection;

beforeAll(async () => {
  connection = await createTestConnection();
});

afterAll(async () => {
  await teardownTestConnection(connection);
});

describe("mongooseAdapter", () => {
  it("produces a working betterAuth instance that can sign up a user", async () => {
    const auth = betterAuth({
      database: mongooseAdapter(connection),
      emailAndPassword: { enabled: true },
      secret: "test-secret-value-at-least-32-chars-long",
    });

    const response = await auth.api.signUpEmail({
      body: {
        email: "smoke@example.com",
        password: "correct-horse-battery-staple",
        name: "Smoke Test",
      },
    });

    expect(response.user.email).toBe("smoke@example.com");
    expect(typeof response.user.id).toBe("string");
    expect(response.user.id).toMatch(/^[0-9a-f]{24}$/); // proves customIdGenerator is wired in
  });

  it("runs a transaction end to end on a replica-set connection", async () => {
    const auth = betterAuth({
      database: mongooseAdapter(connection),
      emailAndPassword: { enabled: true },
      secret: "test-secret-value-at-least-32-chars-long",
    });

    // Force adapter initialization (models registered) before touching transaction().
    await auth.api.signUpEmail({
      body: {
        email: "tx-init@example.com",
        password: "correct-horse-battery-staple",
        name: "Init",
      },
    });

    const adapterInstance = auth.$context ? await (await auth.$context).adapter : undefined;
    expect(adapterInstance).toBeDefined();

    const result = await adapterInstance!.transaction(async (trx) => {
      return trx.count({ model: "user" });
    });

    expect(typeof result).toBe("number");
    expect(result as number).toBeGreaterThanOrEqual(1);
  });

  it("rolls back a create when the transaction callback throws", async () => {
    const auth = betterAuth({
      database: mongooseAdapter(connection),
      emailAndPassword: { enabled: true },
      secret: "test-secret-value-at-least-32-chars-long",
    });

    const adapterInstance = auth.$context ? await (await auth.$context).adapter : undefined;
    expect(adapterInstance).toBeDefined();

    const id = generateObjectIdString();

    await expect(
      adapterInstance!.transaction(async (trx) => {
        await trx.create({
          model: "user",
          data: {
            id,
            email: "rollback-test@example.com",
            name: "Rollback Test",
            emailVerified: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          forceAllowId: true,
        } as any);
        throw new Error("Simulated failure");
      }),
    ).rejects.toThrow("Simulated failure");

    const found = await adapterInstance!.findMany({
      model: "user",
      where: [
        {
          field: "email",
          value: "rollback-test@example.com",
          operator: "eq",
          connector: "AND",
          mode: "sensitive",
        },
      ],
    });
    expect(found).toHaveLength(0);
  });
});
