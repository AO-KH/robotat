import { describe, it, expect } from "vitest";
import { clientError } from "../server/lib/errors";

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
