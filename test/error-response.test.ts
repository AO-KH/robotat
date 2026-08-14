import { describe, it, expect } from "vitest";
import { clientError, pgErrorCode, PG_UNIQUE_VIOLATION } from "../server/lib/errors";

/*
  The message this fixture carries is not invented. It is what a browser was actually
  shown, in a toast, on the first deploy that ran against a database with no schema:
  the table, every column including password_hash, and a real address as a bound
  parameter. Drizzle puts the query and its params in `message`, and the error handler
  used to return `message` verbatim.
*/
const DRIZZLE_FAILURE = Object.assign(new Error(), {
  message:
    'Failed query: select "id", "name", "email", "email_canonical", "password_hash", ' +
    '"role", "email_verified_at", "token_version", "locale", "created_at" from "users" ' +
    'where "users"."email_canonical" = $1 params: someone@example.com',
});

describe("clientError", () => {
  describe("in production", () => {
    it("does not repeat what a 500 was given", () => {
      const { status, message } = clientError(DRIZZLE_FAILURE, true);
      expect(status).toBe(500);
      expect(message).toBe("Internal Server Error");
    });

    it("leaks neither the schema nor the parameters of a failed query", () => {
      const { message } = clientError(DRIZZLE_FAILURE, true);
      for (const secret of ["password_hash", "email_canonical", "someone@example.com", "select", "users"]) {
        expect(message.toLowerCase()).not.toContain(secret.toLowerCase());
      }
    });

    it("still passes 4xx through, because that copy is written to be read", () => {
      // The booking gate's own words — a user needs to know what to do next.
      const err = Object.assign(new Error(), {
        status: 403,
        message: "Confirm your email address before booking a site assessment.",
      });
      expect(clientError(err, true)).toEqual({
        status: 403,
        message: "Confirm your email address before booking a site assessment.",
      });
    });

    it("treats an error carrying no status as a 500, and redacts it", () => {
      const err = Object.assign(new Error(), { message: "connect ECONNREFUSED 10.0.0.4:5432" });
      expect(clientError(err, true)).toEqual({ status: 500, message: "Internal Server Error" });
    });

    it("reads statusCode as well as status", () => {
      const err = Object.assign(new Error(), { statusCode: 413, message: "request entity too large" });
      expect(clientError(err, true)).toEqual({ status: 413, message: "request entity too large" });
    });

    it("redacts every 5xx, not only 500", () => {
      const err = Object.assign(new Error(), { status: 503, message: "pool exhausted at db-primary-1" });
      expect(clientError(err, true).message).toBe("Internal Server Error");
    });
  });

  describe("outside production", () => {
    it("keeps the real message, which is how the failure gets diagnosed locally", () => {
      const { status, message } = clientError(DRIZZLE_FAILURE, false);
      expect(status).toBe(500);
      expect(message).toContain("Failed query");
    });
  });

  it("survives being handed something that is not an Error", () => {
    // An error handler is the last thing standing; it must not become the failure.
    expect(clientError(undefined, true)).toEqual({ status: 500, message: "Internal Server Error" });
    expect(clientError(null, true)).toEqual({ status: 500, message: "Internal Server Error" });
    expect(clientError("boom", true)).toEqual({ status: 500, message: "Internal Server Error" });
  });
});

/*
  How Drizzle actually hands a driver error up. queryWithCache catches whatever pg threw
  and rethrows this, putting the original on `.cause` and copying nothing off it — which
  is why reading `err.code` finds undefined for every database error in this app.
*/
function drizzleWrapped(pgError: unknown) {
  const wrapped = new Error("Failed query: insert into \"users\" ...\nparams: Ada,ada@example.com,...");
  (wrapped as { cause?: unknown }).cause = pgError;
  return wrapped;
}

describe("pgErrorCode", () => {
  it("finds the code on a bare driver error", () => {
    expect(pgErrorCode(Object.assign(new Error("dup"), { code: "23505" }))).toBe("23505");
  });

  it("finds the code through Drizzle's wrapper — the case that was silently failing", () => {
    const err = drizzleWrapped(Object.assign(new Error("duplicate key value"), { code: "23505" }));

    // The old check. It reads undefined, so registration's unique-violation branch
    // never ran and the race fell through to a 500.
    expect((err as { code?: string }).code).toBeUndefined();

    expect(pgErrorCode(err)).toBe(PG_UNIQUE_VIOLATION);
  });

  it("keeps working if something wraps the wrapper", () => {
    const err = drizzleWrapped(drizzleWrapped(Object.assign(new Error("dup"), { code: "23505" })));
    expect(pgErrorCode(err)).toBe("23505");
  });

  it("returns undefined when there is no code anywhere", () => {
    expect(pgErrorCode(drizzleWrapped(new Error("connection terminated")))).toBeUndefined();
    expect(pgErrorCode(new Error("plain"))).toBeUndefined();
    expect(pgErrorCode(undefined)).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
    expect(pgErrorCode("string")).toBeUndefined();
  });

  it("ignores a non-string code rather than reporting it", () => {
    expect(pgErrorCode(Object.assign(new Error("x"), { code: 23505 }))).toBeUndefined();
  });

  it("terminates on a cyclic cause chain", () => {
    const a = new Error("a");
    const b = new Error("b");
    (a as { cause?: unknown }).cause = b;
    (b as { cause?: unknown }).cause = a;
    expect(pgErrorCode(a)).toBeUndefined();
  });
});
