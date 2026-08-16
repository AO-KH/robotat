import { pushTokens, type PushToken, type PushPlatform } from "@shared/schema";
import { db } from "../../lib/db";
import { requireRow } from "../../lib/errors";
import { and, eq, inArray, sql } from "drizzle-orm";

/**
 * Store this device's token, or re-point an existing one.
 *
 * The conflict target is the TOKEN, not the user: a device belongs to exactly one
 * token, but that device can be handed to someone else who signs in with their own
 * account. When that happens the row must move to the new user rather than be
 * duplicated — otherwise the fan-out would send one person's booking updates to a
 * phone that is now in someone else's pocket.
 *
 * Re-registering is therefore idempotent by construction: the app can call this on
 * every launch and only last_seen_at moves.
 */
export async function upsertPushToken(input: {
  userId: number;
  token: string;
  platform?: PushPlatform;
}): Promise<PushToken> {
  const [row] = await db
    .insert(pushTokens)
    .values({
      userId: input.userId,
      token: input.token,
      platform: input.platform ?? "ios",
    })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { userId: sql`excluded.user_id`, lastSeenAt: sql`now()` },
    })
    .returning();
  return requireRow(row, "upsertPushToken");
}

/**
 * Forget one device.
 *
 * Scoped to the owner so a caller cannot unregister a token they do not hold. Because
 * `token` is UNIQUE, a token belongs to at most one user at a time, so passing someone
 * else's token simply matches nothing — deleting nothing is the right answer, and the
 * route reports success either way rather than leaking whether the token exists.
 */
export async function deletePushToken(userId: number, token: string): Promise<number> {
  const deleted = await db
    .delete(pushTokens)
    .where(and(eq(pushTokens.userId, userId), eq(pushTokens.token, token)))
    .returning({ id: pushTokens.id });
  return deleted.length;
}

/**
 * Forget every device belonging to one user. The sweep behind sign-out.
 *
 * The client releases its own token first, but that request can fail — a phone with no
 * connectivity signs out locally and the row survives. Doing it again server-side, where
 * connectivity is not in question, is what actually guarantees the row cannot outlive the
 * session and start delivering this user's booking details to the next person holding
 * the device.
 */
export async function deleteTokensForUser(userId: number): Promise<number> {
  const deleted = await db
    .delete(pushTokens)
    .where(eq(pushTokens.userId, userId))
    .returning({ id: pushTokens.id });
  return deleted.length;
}

/** Every device registered to a user — the fan-out's input. */
export async function getTokensForUser(userId: number): Promise<PushToken[]> {
  return db.select().from(pushTokens).where(eq(pushTokens.userId, userId));
}

/**
 * Drop tokens by value, regardless of owner. For pruning the tokens APNs reports as
 * unregistered (410) after a send — at that point the device is gone and the owner is
 * irrelevant. Not called yet; the fan-out chunk uses it.
 */
export async function deleteTokensByValue(tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  const deleted = await db
    .delete(pushTokens)
    .where(inArray(pushTokens.token, tokens))
    .returning({ id: pushTokens.id });
  return deleted.length;
}
