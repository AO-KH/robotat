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
