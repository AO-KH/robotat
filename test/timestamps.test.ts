import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { pool } from "../server/lib/db";
import { getAssessmentById, listUsersWithBookingCounts } from "../server/modules/admin/admin.storage";
import { resetDb, closeDb } from "./helpers";

/**
 * A timestamp that leaves the API must name the instant it happened.
 *
 * Every `created_at` here is filled by the database's own clock. `now()` returns a
 * `timestamptz`; storing it converts to the **database session's** TimeZone, so a
 * `timestamp without time zone` column ends up holding a local wall clock rather than an
 * instant. Drizzle then reads that column back with `new Date(value + "+0000")` — it has
 * no way to know which zone the wall clock belongs to, so it assumes UTC. The two halves
 * disagree by exactly the database's UTC offset, and every value that reaches a customer
 * or a staff screen is shifted by it. Measured before the fix: a booking made at 18:30
 * Riyadh came back as 18:30Z, three hours in the future.
 *
 * This has bitten the repo once already, as a "24-hour" booking window that was really
 * 27 — see the note on createAssessmentWithinLimit, which fixed its instance by keeping
 * both sides of the comparison inside SQL. Anything that reads one of these columns out
 * into JavaScript inherits the same offset.
 *
 * ## Why the tests force a zone
 *
 * The bug is invisible on a machine where the database session and the Node process are
 * both UTC: the wall clock and the instant coincide, so a naive "is it about now?" check
 * passes while the defect is fully present. These write their rows inside a transaction
 * that has moved the session to Pacific/Kiritimati (UTC+14, no DST), so the two frames
 * cannot coincide anywhere and a regression fails on every host. `SET LOCAL` rather than
 * `SET`, so the zone is reverted by COMMIT and the pooled connection is handed back
 * clean.
 *
 * Fourteen hours is far larger than any plausible clock skew or test latency, hence the
 * generous tolerance below: this is asserting a timezone frame, not a stopwatch.
 */

/** How far from "now" a freshly-written row may read. Wide on purpose — see above. */
const TOLERANCE_MS = 5 * 60 * 1000;

const SKEWED_ZONE = "Pacific/Kiritimati"; // UTC+14

/** Run statements on one connection whose session timezone is temporarily `tz`. */
async function inZone(tz: string, run: (q: (text: string, params?: unknown[]) => Promise<void>) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL TIME ZONE '${tz}'`);
    await run(async (text, params) => {
      await client.query(text, params);
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function assertIsNow(value: Date | null | undefined, what: string) {
  expect(value, what).toBeInstanceOf(Date);
  const drift = value!.getTime() - Date.now();
  expect(
    Math.abs(drift),
    `${what} is ${(drift / 3_600_000).toFixed(2)}h from now — it holds a wall clock, not an instant`,
  ).toBeLessThan(TOLERANCE_MS);
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});

describe("timestamps written by the database clock name a real instant", () => {
  beforeEach(async () => {
    await inZone(SKEWED_ZONE, async (q) => {
      await q(
        `INSERT INTO users (name, email, email_canonical, password_hash)
         VALUES ('Owner', 'owner@example.com', 'owner@example.com', 'x')`,
      );
      await q(
        `INSERT INTO assessments (user_id, name, email)
         VALUES ((SELECT id FROM users WHERE email = 'owner@example.com'), 'Owner', 'owner@example.com')`,
      );
    });
  });

  it("assessments.created_at, as the dashboard and the admin list read it", async () => {
    const [{ id }] = (await pool.query<{ id: number }>("SELECT id FROM assessments")).rows;
    const booking = await getAssessmentById(id);
    assertIsNow(booking?.createdAt, "assessment.createdAt");
  });

  it("users.created_at and the Users tab's lastBookingAt", async () => {
    // lastBookingAt is max(assessments.created_at) — an aggregate inherits the column's
    // decoder, so it is shifted by exactly as much as the column it summarises.
    const [row] = await listUsersWithBookingCounts();
    assertIsNow(row?.createdAt, "user.createdAt");
    assertIsNow(row?.lastBookingAt, "user.lastBookingAt");
  });

  it("agrees with what the database itself thinks the row's age is", async () => {
    /*
      The fix has to be in the storage frame, not an offset applied on the way out, and
      this is what says so: with a wall-clock column even Postgres gets the age wrong.
      `now() - created_at` converts `now()` down using the READING session's zone, so a
      row written by a session in another zone reads as hours old the moment it is
      inserted — 11 hours here, the gap between Kiritimati and this database's own
      Asia/Riyadh. There is no single offset to correct for, because the number depends
      on who is asking. Stored as an instant, both this and the Drizzle read below agree
      with the wall clock and with each other.
    */
    const [{ age }] = (
      await pool.query<{ age: string }>(
        "SELECT EXTRACT(EPOCH FROM (now() - created_at)) AS age FROM assessments",
      )
    ).rows;
    expect(Math.abs(Number(age))).toBeLessThan(TOLERANCE_MS / 1000);

    const [{ id }] = (await pool.query<{ id: number }>("SELECT id FROM assessments")).rows;
    assertIsNow((await getAssessmentById(id))?.createdAt, "assessment.createdAt");
  });
});
