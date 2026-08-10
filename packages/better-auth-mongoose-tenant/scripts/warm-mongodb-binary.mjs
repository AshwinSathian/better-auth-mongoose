// Four test files each start their own in-memory MongoDB instance, and
// vitest runs them concurrently. On a cold cache (no CI run has downloaded
// this MongoDB version yet), several of them can start downloading the same
// binary at once and race on mongodb-memory-server-core's own lock file,
// which has a known bug under concurrent access ("cannot unlock file,
// because it is not locked by this process"). Downloading it once, serially,
// before the parallel test run starts means every worker just finds it
// already on disk and never touches the lock file at all.
import { MongoMemoryServer } from "mongodb-memory-server";

const server = await MongoMemoryServer.create();
await server.stop();
