import { assessments, type Assessment } from "@shared/schema";
import { db } from "../../lib/db";
import { eq, and, desc, gte, count, sql } from "drizzle-orm";

export async function createAssessment(input: {
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
}): Promise<Assessment> {
  const [assessment] = await db.insert(assessments).values(input).returning();
  return assessment;
}

/**
 * How many bookings this account has made in the last `windowHours`.
 *
 * Counted in SQL rather than by loading the rows and measuring the array: the caller
 * only wants the number, and a heavy user would otherwise pull their whole history
 * across the wire on every booking.
 *
 * The cutoff is computed in SQL too, and that part is not a style choice. `created_at`
 * is `timestamp without time zone` filled by `now()`, so it holds the database's local
 * wall clock — 15:00 on a server set to Asia/Riyadh, not the 12:00 UTC instant. Drizzle
 * serialises a JavaScript Date as UTC, so passing `Date.now() - 24h` compared a UTC
 * instant against local wall-clock values and the boundary landed one UTC offset out.
 * Measured on this machine: a booking aged 25 hours still counted, and only fell out of
 * the window at 30 — a 27-hour limit wearing a 24-hour label, and it would be 21 hours
 * on a server west of UTC.
 *
 * `now()` on both sides keeps the comparison inside one clock, whatever that clock is.
 */
export async function countRecentAssessments(userId: number, windowHours: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(assessments)
    .where(
      and(
        eq(assessments.userId, userId),
        gte(assessments.createdAt, sql`(now() - make_interval(hours => ${windowHours}))::timestamp`),
      ),
    );
  return row?.n ?? 0;
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
