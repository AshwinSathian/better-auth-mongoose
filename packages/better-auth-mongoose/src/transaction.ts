import type { Connection } from "mongoose";

// Replica-set-vs-standalone is a deployment-time property of a connection,
// not something that changes mid-process — cached per connection (like
// registerModels' own modelsCache) so the real probe below, a full extra
// session/transaction round trip, doesn't run again on every single
// transaction() call for the connection's lifetime. Only a *resolved* probe
// is cached; while the connection isn't ready yet (no connection.db),
// nothing is cached, so a later call still gets a real answer.
const supportsSessionsCache = new WeakMap<Connection, Promise<boolean>>();

/**
 * Detects whether the connection can run sessions/transactions. Mongoose
 * only supports these on a replica set or sharded cluster, not a standalone
 * mongod — a common local-dev setup. `session.startTransaction()` is purely
 * client-side state and never contacts the server, so it never throws by
 * itself even on a standalone instance — the rejection only happens once an
 * actual operation runs inside the transaction. This probe issues a real
 * no-op read within the transaction so a standalone server's rejection is
 * actually observed, rather than assuming support based on connection
 * options. Uses a collection-level find (not an admin command like `ping`,
 * which MongoDB itself doesn't permit inside a transaction) so the probe
 * exercises exactly the kind of operation this adapter actually performs.
 */
export function supportsSessions(connection: Connection): Promise<boolean> {
  const db = connection.db;
  if (!db) return Promise.resolve(false);

  let cached = supportsSessionsCache.get(connection);
  if (!cached) {
    cached = probeSessionSupport(connection, db);
    supportsSessionsCache.set(connection, cached);
  }
  return cached;
}

async function probeSessionSupport(
  connection: Connection,
  db: NonNullable<Connection["db"]>,
): Promise<boolean> {
  const session = await connection.startSession();
  try {
    session.startTransaction();
    await db.collection("__better_auth_mongoose_probe__").findOne({}, { session });
    await session.abortTransaction();
    return true;
  } catch {
    return false;
  } finally {
    await session.endSession();
  }
}
