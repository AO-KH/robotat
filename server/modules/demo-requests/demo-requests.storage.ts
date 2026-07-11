import { demoRequests, type DemoRequest, type InsertDemoRequest } from "@shared/schema";
import { db } from "../../lib/db";

export async function createDemoRequest(input: InsertDemoRequest): Promise<DemoRequest> {
  const [request] = await db.insert(demoRequests).values(input).returning();
  return request;
}
