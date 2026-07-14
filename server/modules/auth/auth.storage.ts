import { users, authTokens, type User, type AuthToken, type AuthTokenKind } from "@shared/schema";
import { db } from "../../lib/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

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

export async function updateUserName(id: number, name: string): Promise<User> {
  const [user] = await db.update(users).set({ name }).where(eq(users.id, id)).returning();
  return user;
}

export async function updateUserPassword(id: number, passwordHash: string): Promise<void> {
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));
}

export async function markEmailVerified(id: number): Promise<User> {
  const [user] = await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return user;
}

/* ---- Auth tokens (password reset / email verification) ---- */

export async function createAuthToken(input: {
  userId: number;
  kind: AuthTokenKind;
  tokenHash: string;
  expiresAt: Date;
}): Promise<AuthToken> {
  const [token] = await db.insert(authTokens).values(input).returning();
  return token;
}

/** A token is valid if it matches, is of the right kind, is unused, and unexpired. */
export async function getValidAuthToken(kind: AuthTokenKind, tokenHash: string): Promise<AuthToken | undefined> {
  const [token] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.kind, kind),
        eq(authTokens.tokenHash, tokenHash),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    );
  return token;
}

export async function markAuthTokenUsed(id: number): Promise<void> {
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, id));
}

/** Invalidate any outstanding (unused) tokens of a kind for a user — one live link at a time. */
export async function invalidateUserTokens(userId: number, kind: AuthTokenKind): Promise<void> {
  await db
    .update(authTokens)
    .set({ usedAt: sql`now()` })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.kind, kind), isNull(authTokens.usedAt)));
}
