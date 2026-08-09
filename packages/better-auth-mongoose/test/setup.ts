import mongoose, { type Connection } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let replSet: MongoMemoryReplSet | undefined;

export async function createTestConnection(): Promise<Connection> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const connection = mongoose.createConnection(replSet.getUri());
  await connection.asPromise();
  return connection;
}

export async function teardownTestConnection(connection: Connection): Promise<void> {
  await connection.close();
  await replSet?.stop();
  replSet = undefined;
}
