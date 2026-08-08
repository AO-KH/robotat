import { assessments, type Assessment } from "@shared/schema";
import { db } from "../../lib/db";
import { eq, and, desc, gte, count, sql } from "drizzle-orm";

/** The fields a booking is created from. */
export interface NewAssessment {
  userId: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  landSize?: string;
  location?: string;
  message?: string;
  /** Omitted by clients that predate the column; the column default supplies "en". */
  locale?: string;
}

/**
 * Advisory-lock namespace for booking slots.
 *
 * Postgres advisory locks share one global space, so the two-argument form keys them by
 * (namespace, id). Without a namespace, locking on a user id here would collide with
 * anything else that ever locks on an id of its own.
 */
const BOOKING_LOCK_NAMESPACE = 1;

/**
 * Create a booking, unless this account already has `limit` within `windowHours`.
 *
 * Returns the new row, or null when the account is at its limit — a value rather than a
 * thrown error, because being at the limit is an ordinary answer to an ordinary request,
 * not a failure.
 *
 * ## Why this counts and inserts in one transaction
 *
 * Counting and then inserting as two statements leaves a window where two requests both
 * read "two so far" and both write, landing four. Under load — a double-tapped button, a
 * retry, two devices — that window is small but real.
 *
 * The advisory lock is what closes it. `pg_advisory_xact_lock` is taken on the account
 * id and released when the transaction ends, so bookings for one account queue behind
 * each other while bookings for everyone else proceed untouched. `SELECT ... FOR UPDATE`
 * on the user row would also serialise these, but it would additionally block anything
 * else holding that row — a profile edit, a password change — for reasons those callers
 * could not guess from reading their own code.
 *
 * ## Why the cutoff is computed in SQL
 *
 * This originally passed `Date.now() - 24h` from JavaScript, and the boundary landed one
 * UTC offset out: `created_at` was `timestamp without time zone` filled by `now()`, so it
 * held the database's local wall clock, while Drizzle serialised the JavaScript Date as
 * UTC. Measured on this machine, a booking aged 25 hours still counted and only fell out
 * of the window at 30 — a 27-hour limit wearing a 24-hour label, and 21 hours on a server
 * west of UTC.
 *
 * Migration 0013 made `created_at` a `timestamptz`, which removes the storage side of
 * that mismatch, and the `::timestamp` cast this comparison used to carry went with it —
 * it existed only to meet the column in its wall-clock frame. Both sides are now instants
 * and the comparison means what it reads as.
 *
 * The cutoff still comes from `now()` rather than from JavaScript, and that is worth
 * keeping for its own reason: one clock decides the window. A Date from this process
 * would make the boundary depend on how far the app server's clock had drifted from the
 * database's, which is a much smaller error than an hour but a far stranger one to
 * diagnose when a customer is refused their third booking a minute early.
 */
export async function createAssessmentWithinLimit(
  input: NewAssessment,
  opts: { windowHours: number; limit: number },
): Promise<Assessment | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${BOOKING_LOCK_NAMESPACE}::int, ${input.userId}::int)`,
    );


    const [row] = await tx
      .select({ n: count() })
      .from(assessments)
      .where(
        and(
          eq(assessments.userId, input.userId),
          gte(assessments.createdAt, sql`now() - make_interval(hours => ${opts.windowHours})`),
        ),
      );

    if ((row?.n ?? 0) >= opts.limit) return null;

    const [created] = await tx.insert(assessments).values(input).returning();
    return created;
  });
}

export async function listAssessmentsByUser(userId: number): Promise<Assessment[]> {
  return db
    .select()
    .from(assessments)
    .where(eq(assessments.userId, userId))
    .orderBy(desc(assessments.createdAt));
}

/** A single booking, but only if it belongs to the given user. */
export async function getAssessmentForUser(id: number, userId: number): Promise<Assessment | undefined> {
  const [row] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.id, id), eq(assessments.userId, userId)));
  return row;
}
