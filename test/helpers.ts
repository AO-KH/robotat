import { pool } from "../server/lib/db";

// The shared server lives in ./server, which imports nothing at runtime — see the note
// there. Re-exported so test files keep getting it from one place.
export { getApp, closeServer } from "./server";

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
