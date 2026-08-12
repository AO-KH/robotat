import type { Server } from "http";
import { buildApp } from "../server/app";
import { pool } from "../server/lib/db";

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
 * ever adopts it, and nothing closes it mid-flight. `closeServer()` — wired into
 * test/setup.ts so every file gets it — does that once, after the file is done.
 *
 * `buildApp()`'s own `httpServer` is what gets bound, rather than a fresh `app.listen()`,
 * so the tests exercise the same `createServer(app)` wiring that index.ts runs.
 */
export async function getApp(): Promise<Server> {
  if (!cachedServer) {
    const { httpServer } = await buildApp();
    cachedServer = await new Promise<Server>((resolve) => {
      httpServer.listen(0, () => resolve(httpServer));
    });
  }
  return cachedServer;
}

/** Stop the shared server. Called once per test file from test/setup.ts. */
export async function closeServer(): Promise<void> {
  const server = cachedServer;
  cachedServer = undefined;
  if (!server) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

/** Wipe all data between tests. `user_sessions` is created lazily by the session store. */
export async function resetDb(): Promise<void> {
  await pool.query(
    `DO $$ BEGIN IF to_regclass('public.user_sessions') IS NOT NULL THEN TRUNCATE user_sessions; END IF; END $$;`,
  );
  await pool.query(
    "TRUNCATE users, assessments, analytics_events, auth_tokens, push_tokens RESTART IDENTITY CASCADE",
  );
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

/** Promote a registered user to the staff role (for admin tests). */
export async function makeStaff(email: string): Promise<void> {
  await pool.query("UPDATE users SET role = 'staff' WHERE email = $1", [email.toLowerCase()]);
}

/**
 * Mark an account's email confirmed, without going through the code.
 *
 * Booking requires a verified address, so most tests here would otherwise have to fetch
 * a code out of the response and redeem it before they could get to the thing they are
 * actually testing. The verification flow has its own tests; everywhere else this is
 * setup, and setup should not re-exercise a feature it does not care about.
 */
export async function verifyUser(email: string): Promise<void> {
  await pool.query("UPDATE users SET email_verified_at = now() WHERE email = $1", [email.toLowerCase()]);
}

/** Register through the API and confirm the address, ready to book. */
export async function registerVerified(
  agent: { post: (url: string) => { send: (body: unknown) => Promise<unknown> } },
  overrides: Partial<{ name: string; email: string; password: string; locale: string }> = {},
) {
  const user = newUser(overrides);
  await agent.post("/api/auth/register").send(user);
  await verifyUser(user.email);
  return user;
}

/**
 * Age every booking so it falls outside the daily-limit window.
 *
 * Time is the one input a request cannot supply, so a rolling window is otherwise
 * only testable by waiting a day. Moving the rows backwards is the same assertion
 * with none of the wait.
 */
export async function ageAllAssessments(interval = "25 hours"): Promise<void> {
  await pool.query(`UPDATE assessments SET created_at = now() - $1::interval`, [interval]);
}

/** A valid registration payload with a unique-ish email. */
export function newUser(overrides: Partial<{ name: string; email: string; password: string; locale: string }> = {}) {
  return {
    name: "Test User",
    email: "test.user@example.com",
    password: "password123",
    ...overrides,
  };
}
