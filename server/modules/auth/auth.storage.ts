import { users, type User } from "@shared/schema";
import { db } from "../../lib/db";
import { eq } from "drizzle-orm";

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({ name: input.name, email: input.email.toLowerCase(), passwordHash: input.passwordHash })
    .returning();
  return user;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return user;
}
