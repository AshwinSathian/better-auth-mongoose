import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer, MongoMemoryReplSet } from "mongodb-memory-server";
import { supportsSessions } from "../src/transaction";

describe("supportsSessions", () => {
  it("returns true against a replica set connection", async () => {
    const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const connection = mongoose.createConnection(replSet.getUri());
    await connection.asPromise();

    await expect(supportsSessions(connection)).resolves.toBe(true);

    await connection.close();
    await replSet.stop();
  });

  it("returns false against a standalone (non-replica-set) instance, without throwing", async () => {
    const standalone = await MongoMemoryServer.create(); // no replSet option => standalone
    const connection = mongoose.createConnection(standalone.getUri());
    await connection.asPromise();

    await expect(supportsSessions(connection)).resolves.toBe(false);

    await connection.close();
    await standalone.stop();
  });
});
