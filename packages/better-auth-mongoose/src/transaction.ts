import type { Connection } from "mongoose";

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
export async function supportsSessions(connection: Connection): Promise<boolean> {
  if (!connection.db) return false;

  const session = await connection.startSession();
  try {
    session.startTransaction();
    await connection.db.collection("__better_auth_mongoose_probe__").findOne({}, { session });
    await session.abortTransaction();
    return true;
  } catch {
    return false;
  } finally {
    await session.endSession();
  }
}
