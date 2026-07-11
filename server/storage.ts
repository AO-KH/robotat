import {
  demoRequests,
  users,
  assessments,
  type DemoRequest,
  type InsertDemoRequest,
  type User,
  type Assessment,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  createDemoRequest(request: InsertDemoRequest): Promise<DemoRequest>;

  createUser(input: { name: string; email: string; passwordHash: string }): Promise<User>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;

  createAssessment(input: {
    userId: number;
    name: string;
    email: string;
    phone?: string;
    company?: string;
    landSize?: string;
    location?: string;
    message?: string;
  }): Promise<Assessment>;
  listAssessmentsByUser(userId: number): Promise<Assessment[]>;
}

export class DatabaseStorage implements IStorage {
  async createDemoRequest(insertRequest: InsertDemoRequest): Promise<DemoRequest> {
    const [request] = await db.insert(demoRequests).values(insertRequest).returning();
    return request;
  }

  async createUser(input: { name: string; email: string; passwordHash: string }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({ name: input.name, email: input.email.toLowerCase(), passwordHash: input.passwordHash })
      .returning();
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async createAssessment(input: {
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

  async listAssessmentsByUser(userId: number): Promise<Assessment[]> {
    return db
      .select()
      .from(assessments)
      .where(eq(assessments.userId, userId))
      .orderBy(desc(assessments.createdAt));
  }
}

export const storage = new DatabaseStorage();
