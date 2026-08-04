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

/**
 * Invalidate every credential the user currently holds:
 *   - bumps token_version, so all previously-issued bearer tokens stop verifying
 *   - deletes their server-side sessions, so cookies elsewhere stop working
 *
 * Call after a password change or reset. `keepSessionId` preserves the session that
 * performed the change, so a signed-in user changing their own password isn't logged
 * out of the tab they're using.
 *
 * The session delete reaches into connect-pg-simple's `user_sessions` table (it owns
 * that schema and creates it lazily, hence to_regclass). Passport stores the user id
 * at sess->'passport'->>'user'.
 */
export async function revokeUserCredentials(id: number, keepSessionId?: string): Promise<void> {
  await db.update(users).set({ tokenVersion: sql`${users.tokenVersion} + 1` }).where(eq(users.id, id));

  // Separate existence check rather than a DO block: bind parameters cannot cross
  // into a dollar-quoted body, so `$1` inside DO $$ … $$ would be literal text.
  const present = await db.execute<{ present: boolean }>(
    sql`SELECT to_regclass('public.user_sessions') IS NOT NULL AS present`,
  );
  if (!present.rows[0]?.present) return;

  await db.execute(
    sql`DELETE FROM user_sessions
        WHERE sess -> 'passport' ->> 'user' = ${String(id)}
          AND sid <> ${keepSessionId ?? ""}`,
  );
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
