import { assessments, type Assessment, type AssessmentStatus } from "@shared/schema";
import { db } from "../../lib/db";
import { eq, desc } from "drizzle-orm";

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
