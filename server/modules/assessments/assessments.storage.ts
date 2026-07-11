import { assessments, type Assessment } from "@shared/schema";
import { db } from "../../lib/db";
import { eq, desc } from "drizzle-orm";

export async function createAssessment(input: {
  userId: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  landSize?: string;
  location?: string;
  message?: string;
}): Promise<Assessment> {
  const [assessment] = await db.insert(assessments).values(input).returning();
  return assessment;
}

export async function listAssessmentsByUser(userId: number): Promise<Assessment[]> {
  return db
    .select()
    .from(assessments)
    .where(eq(assessments.userId, userId))
    .orderBy(desc(assessments.createdAt));
}
