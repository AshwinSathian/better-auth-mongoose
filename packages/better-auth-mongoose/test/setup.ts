import mongoose, { type Connection } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let replSet: MongoMemoryReplSet | undefined;

export async function createTestConnection(): Promise<Connection> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const connection = mongoose.createConnection(replSet.getUri());
  await connection.asPromise();
  return connection;
}

export async function teardownTestConnection(connection: Connection | undefined): Promise<void> {
  // connection can still be undefined here if createTestConnection() itself
  // threw (e.g. the in-memory replica set failed to start) before returning
  // it to the caller's beforeAll — afterAll still runs regardless, and
  // calling .close() on undefined would mask the real error with a second,
  // unrelated crash.
  await connection?.close();
  await replSet?.stop();
  replSet = undefined;
}
