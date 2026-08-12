import { afterAll } from "vitest";

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
  leak a listening handle, and so the thirteen existing files did not each need editing.

  The import is dynamic on purpose. `./helpers` pulls in server/lib/db, which builds the
  connection pool at module scope — and a static import is hoisted above the guard above,
  so the pool would be dialled before the "is this really a test database?" check had a
  chance to throw. Deferring it to teardown keeps the guard first, which is the whole
  point of it.
*/
afterAll(async () => {
  const { closeServer } = await import("./helpers");
  await closeServer();
});
