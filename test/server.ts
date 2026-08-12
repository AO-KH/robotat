import type { Server } from "http";

/*
  The shared test server, deliberately in a module of its own.

  Nothing is imported at module scope here except a type, which erases. That is the whole
  reason this file is separate from helpers.ts: test/setup.ts imports it for EVERY file in
  the server project, so that closeServer() cannot be forgotten by a new test — and
  helpers.ts statically imports ../server/app and ../server/lib/db, which is the entire
  Express graph plus a connection pool.

  Loading all of that into files that never start a server is waste, and inside an afterAll
  with a 10 second budget it is a failure: it timed out on Windows, and passed on Linux by a
  margin close enough to be luck. Keeping the holder dependency-free means the cost is paid
  only by the files that actually call getApp().
*/

let cachedServer: Server | undefined;

/**
 * Build (once) and return a *listening* server for supertest.
 *
 * Returning a listening server rather than the bare Express app is load-bearing, and the
 * reason is a race inside supertest rather than anything about this app.
 *
 * Handed a function, supertest wraps it in a server and then, per request, runs
 * `if (!addr) this._server = app.listen(0)` (supertest/lib/test.js:63) — the first request
 * to find that shared server unbound adopts it, and closes it again when that request
 * ends. Sequentially this is invisible: listen, close, listen, close. Fire a burst through
 * `Promise.all` and every request is constructed before any listen resolves, so a dozen of
 * them call `listen()` on the same server and the first one to finish closes the socket out
 * from under the rest. Those fail with `read ECONNRESET`, nowhere near what they were
 * asserting — and because it is a race, it loses on one machine and wins on another.
 *
 * That is exactly what happened to the 60-request burst in account-recovery.test.ts: green
 * on a developer's Windows box, `read ECONNRESET` on CI's Linux runner. It was the first
 * concurrent test in the suite, so it was the first to find this.
 *
 * A server that is already listening has an address, so `!addr` is never true, no request
 * ever adopts it, and nothing closes it mid-flight.
 *
 * `buildApp()`'s own `httpServer` is what gets bound, rather than a fresh `app.listen()`,
 * so the tests exercise the same `createServer(app)` wiring that index.ts runs.
 */
export async function getApp(): Promise<Server> {
  if (!cachedServer) {
    // Dynamic, for the reason at the top of this file: the Express graph must not be a
    // cost that every test file pays through setup.ts.
    const { buildApp } = await import("../server/app");
    const { httpServer } = await buildApp();
    cachedServer = await new Promise<Server>((resolve) => {
      httpServer.listen(0, () => resolve(httpServer));
    });
  }
  return cachedServer;
}

/**
 * Stop the shared server. Wired into test/setup.ts, so it runs once per test file.
 *
 * A no-op — and, importantly, an instant one — for the many files that never started a
 * server at all.
 */
export async function closeServer(): Promise<void> {
  const server = cachedServer;
  cachedServer = undefined;
  if (!server) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
