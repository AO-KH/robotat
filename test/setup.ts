import { afterAll } from "vitest";
import { closeServer } from "./server";

// Safety guard: the integration tests TRUNCATE tables, so refuse to run against
// anything but a database whose name clearly marks it as a test database.
const url = process.env.DATABASE_URL ?? "";
if (!/test/i.test(url)) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL must point to a test database (name containing "test"). Got: ${url || "(unset)"}`,
  );
}

/*
  Stop the shared server that getApp() leaves listening, for every file in this project.

  Here rather than in each file's afterAll so that a new test file cannot forget it and
  leak a listening handle.

  `./server` and not `./helpers`: helpers imports server/lib/db, which builds the
  connection pool at module scope, and imports of any kind are hoisted above the guard
  above — so pulling helpers in here would dial the pool before the "is this really a test
  database?" check could throw. ./server imports nothing at runtime, so it is safe to name
  statically and costs the files that never start a server nothing at all.
*/
afterAll(closeServer);
