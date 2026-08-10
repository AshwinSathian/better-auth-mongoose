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

  it("memoizes the probe per connection instead of re-probing on every call", async () => {
    const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const connection = mongoose.createConnection(replSet.getUri());
    await connection.asPromise();

    // A second call must reuse the same in-flight/resolved probe (the exact
    // same Promise instance) rather than starting a brand new session and
    // transaction — repeat calls should be free, not double the cost of
    // every transaction.
    const first = supportsSessions(connection);
    const second = supportsSessions(connection);
    expect(second).toBe(first);
    await expect(first).resolves.toBe(true);

    await connection.close();
    await replSet.stop();
  });
});
