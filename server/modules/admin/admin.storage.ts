import {
  assessments,
  users,
  type AdminUserSummary,
  type Assessment,
  type AssessmentStatus,
} from "@shared/schema";
import { db } from "../../lib/db";
import { eq, desc, count, max } from "drizzle-orm";

/**
 * Every registered account, newest first, with how much each has booked.
 *
 * The column list is written out rather than using `db.select()` on the table, and that
 * is the security property of this function, not a style preference: a bare select
 * returns every column, and one of them is `password_hash`. Naming the columns means a
 * future column is absent until somebody deliberately adds it here, instead of being
 * published to the admin screen — and onwards to anything with a staff session — the
 * moment it is created.
 *
 * A left join keeps accounts that have never booked, which are exactly the ones worth
 * seeing: someone who registered and then did not go through with it.
 */
export async function listUsersWithBookingCounts(): Promise<AdminUserSummary[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      emailVerifiedAt: users.emailVerifiedAt,
      locale: users.locale,
      // count() over the joined column, not over the row: a left join with no match
      // yields one row of nulls, which counts as 1 if you count the row itself.
      bookingCount: count(assessments.id),
      lastBookingAt: max(assessments.createdAt),
    })
    .from(users)
    .leftJoin(assessments, eq(assessments.userId, users.id))
    .groupBy(users.id)
    .orderBy(desc(users.createdAt));

  return rows.map(({ emailVerifiedAt, ...row }) => ({
    ...row,
    emailVerified: emailVerifiedAt != null,
  }));
}

/** Every booking (optionally filtered by status), newest first. */
export async function listAllAssessments(status?: AssessmentStatus): Promise<Assessment[]> {
  if (status) {
    return db
      .select()
      .from(assessments)
      .where(eq(assessments.status, status))
      .orderBy(desc(assessments.createdAt));
  }
  return db.select().from(assessments).orderBy(desc(assessments.createdAt));
}

export async function getAssessmentById(id: number): Promise<Assessment | undefined> {
  const [row] = await db.select().from(assessments).where(eq(assessments.id, id));
  return row;
}

/** Update a booking's status and — when provided — its scheduled date (null clears it). */
export async function updateAssessment(
  id: number,
  values: { status: AssessmentStatus; scheduledAt?: Date | null },
): Promise<Assessment | undefined> {
  const set: { status: AssessmentStatus; scheduledAt?: Date | null } = { status: values.status };
  if (values.scheduledAt !== undefined) set.scheduledAt = values.scheduledAt;

  const [row] = await db.update(assessments).set(set).where(eq(assessments.id, id)).returning();
  return row;
}
