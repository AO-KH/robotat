import {
  users,
  authTokens,
  assessments,
  analyticsEvents,
  type User,
  type AuthToken,
  type AuthTokenKind,
} from "@shared/schema";
import { db } from "../../lib/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

/**
 * What replaces a deleted customer's name and email on the bookings they leave behind.
 * Both columns are NOT NULL, so something has to go there; a visible marker tells staff
 * "this customer deleted their account", which a blank string would not.
 */
export const DELETED_MARKER = "[deleted]";

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
  /** Omitted by clients that predate the column; the column default supplies "en". */
  locale?: string;
}): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      // Left out entirely when undefined, so the column default ("en") applies rather
      // than an explicit null hitting a NOT NULL column.
      ...(input.locale ? { locale: input.locale } : {}),
    })
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

/**
 * Delete the user, keep the work.
 *
 * An assessment records that ROBOTAT sent an agronomist to a farm — a business fact
 * that survives the customer closing their account, and one that may have been
 * invoiced. So the row stays and everything identifying the person is stripped:
 * user_id detached, name and email replaced with a visible marker (they are NOT NULL,
 * and a blank would read to staff as a data bug rather than a deleted customer), and
 * every contact and free-text column nulled.
 *
 * `message` is scrubbed even though it is not nominally a personal field: it is
 * user-authored free text and routinely carries a phone number or an address.
 *
 * Analytics events keep counting toward funnel totals; they just stop being
 * attributable. Auth tokens cascade via their own foreign key.
 *
 * All in one transaction: a partial deletion would leave a user whose bookings still
 * carry their name, which is the exact state this exists to prevent.
 */
export async function deleteAccountAndAnonymise(userId: number): Promise<void> {
  await db.transaction(async (tx) => {
    // Deliberately not touching land_size, status, scheduled_at or created_at: they
    // describe the visit, not the customer, and the business record needs them.
    await tx
      .update(assessments)
      .set({
        userId: null,
        name: DELETED_MARKER,
        email: DELETED_MARKER,
        phone: null,
        company: null,
        location: null,
        message: null,
      })
      .where(eq(assessments.userId, userId));

    await tx.update(analyticsEvents).set({ userId: null }).where(eq(analyticsEvents.userId, userId));

    await tx.delete(users).where(eq(users.id, userId));
  });
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

/**
 * The live verification code for one user, whatever it is.
 *
 * Looked up by user rather than by code hash, which is the difference between a 6-digit
 * code and a 32-byte token. A long token is unique enough to find on its own; a code is
 * one of a million, so several users hold the same one at any moment and finding "the
 * row whose hash is 000042" would redeem a stranger's. The caller compares the typed
 * code against this row, so a code is only ever valid for the account that asked for it.
 */
export async function getLiveVerificationToken(userId: number): Promise<AuthToken | undefined> {
  const [token] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.kind, "email_verification"),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    );
  return token;
}

/**
 * Count one wrong guess, and report how many have been made.
 *
 * Incremented in SQL and read back from the same statement rather than fetched, added to
 * and written: two requests guessing at once would otherwise both read four, both write
 * five, and between them get an extra attempt for free. Small, but the whole point of the
 * counter is that it cannot be worn down.
 */
export async function recordFailedAttempt(id: number): Promise<number> {
  const [row] = await db
    .update(authTokens)
    .set({ attempts: sql`${authTokens.attempts} + 1` })
    .where(eq(authTokens.id, id))
    .returning({ attempts: authTokens.attempts });
  return row?.attempts ?? 0;
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
