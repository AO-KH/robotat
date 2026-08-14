import type { Response } from "express";
import { z } from "zod";

/** If `err` is a Zod validation error, send a 400 and return true; otherwise return false. */
export function handleZodError(err: unknown, res: Response): boolean {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      message: err.errors[0].message,
      field: err.errors[0].path.join("."),
    });
    return true;
  }
  return false;
}

/** Postgres SQLSTATE for unique_violation. */
export const PG_UNIQUE_VIOLATION = "23505";

/**
 * The Postgres error code behind `err`, wherever Drizzle happens to have put it.
 *
 * Reading `err.code` directly does not work and silently does not work, which is worse.
 * Every query goes through `queryWithCache`, which catches and rethrows as
 * `DrizzleQueryError` (drizzle-orm/errors.cjs) — and that constructor copies the driver
 * error onto `.cause` while copying no properties off it. So `err.code` is `undefined`
 * for every database error this application can raise, and a `=== "23505"` test against
 * it is not a check that rarely matches; it is a check that cannot match.
 *
 * The registration handler had exactly that. Its comment describes catching the unique
 * violation when two people claim one mailbox in the same instant, but the condition
 * never fired, so the loser of that race got a 500 instead of the intended 409 — and,
 * before the redaction in clientError() below, a 500 whose body was the INSERT statement
 * and its bound parameters.
 *
 * Walks the chain rather than reading `.cause` once, so another wrapping layer does not
 * quietly reintroduce the same bug. The depth cap is only there to make a cyclic `cause`
 * impossible to hang on.
 */
export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== "object") return undefined;
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * What a failed request is allowed to tell the client. A pure function so it can be
 * tested without standing up a server.
 *
 * The distinction it draws is between messages written FOR a user and messages that
 * merely escaped. A 4xx here is deliberate — "Enter a valid email address", "Confirm
 * your email address before booking a site assessment" — authored to be read, and passed
 * through unchanged. A 5xx is the opposite: nothing produced it on purpose, so its text
 * is whatever the failing layer happened to say.
 *
 * That text is not harmless. When a first deployment ran against a database with no
 * schema, the browser was shown:
 *
 *   Failed query: select "id", "name", "email", "email_canonical", "password_hash",
 *   "role", "email_verified_at", "token_version", "locale", "created_at" from "users"
 *   where "users"."email_canonical" = $1 params: someone@example.com
 *
 * — the table, every column including `password_hash`, and a real customer's address,
 * rendered in a toast. Drizzle puts the query and its parameters in `message`, and the
 * handler passed `message` straight out. Any 5xx anywhere in the app returns whatever
 * the underlying error happens to carry, which is a class of leak rather than one bug.
 *
 * Suppressed only in production, deliberately. Locally the real message in the network
 * tab is how the failure gets diagnosed, and the operator is the only reader. In
 * production the full error still reaches pino at error level with method and path, so
 * nothing is lost to whoever is meant to see it — only to whoever is not.
 */
export function clientError(err: unknown, isProd: boolean): { status: number; message: string } {
  const e = (err ?? {}) as { status?: number; statusCode?: number; message?: string };
  const status = e.status ?? e.statusCode ?? 500;

  if (status >= 500 && isProd) {
    return { status, message: "Internal Server Error" };
  }

  return { status, message: e.message || "Internal Server Error" };
}
