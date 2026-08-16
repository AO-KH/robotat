import { describe, it, expect } from "vitest";
import { envSchema, validateProduction, type Env } from "../server/lib/env";

/**
 * These cover the production boot guard. It previously accepted
 * "change-me-in-production" — the value docker-compose.yml defaulted to — because it
 * only rejected the dev constant and anything under 16 characters. That secret signs
 * both session cookies and bearer tokens, so a committed placeholder booting as
 * production was a full forgery primitive.
 */

const GOOD: Env = {
  NODE_ENV: "production",
  PORT: 5000,
  DATABASE_URL: "postgresql://user:pw@db:5432/robotat",
  SESSION_SECRET: "Zt8Kq2mXv4Lp9RwHs6Yb3Nc7Fj1Dg5Ae0Uz",
  PUBLIC_APP_URL: "https://robotat.sa",
};

const prod = (overrides: Partial<Env>): Env => ({ ...GOOD, ...overrides });

describe("production env guard", () => {
  it("accepts a strong secret with an https app url", () => {
    expect(validateProduction(GOOD)).toEqual([]);
  });

  it("rejects the compose placeholder that used to slip through", () => {
    const problems = validateProduction(prod({ SESSION_SECRET: "change-me-in-production" }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/placeholder/i);
  });

  it("rejects the shared development secret", () => {
    expect(validateProduction(prod({ SESSION_SECRET: "robotat-dev-secret-change-me" }))[0]).toMatch(
      /development secret/i,
    );
  });

  it.each([
    "CHANGE-ME-NOW-abcdefghijklmnopqrst",
    "ChangeMe-abcdefghijklmnopqrstuvwx",
    "my-placeholder-secret-abcdefghijkl",
    "example-secret-abcdefghijklmnopqrs",
  ])("rejects placeholder-looking secret %s regardless of case or length", (secret) => {
    expect(validateProduction(prod({ SESSION_SECRET: secret }))).not.toEqual([]);
  });

  it("rejects a short but otherwise non-placeholder secret", () => {
    expect(validateProduction(prod({ SESSION_SECRET: "Zt8Kq2mXv4Lp9Rw" }))[0]).toMatch(/at least 32/i);
  });

  it("requires PUBLIC_APP_URL — its absence is the host-header injection vector", () => {
    const problems = validateProduction(prod({ PUBLIC_APP_URL: undefined }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/PUBLIC_APP_URL is required/);
  });

  it("requires PUBLIC_APP_URL to be https", () => {
    expect(validateProduction(prod({ PUBLIC_APP_URL: "http://robotat.sa" }))[0]).toMatch(/https/);
  });

  it("reports every problem at once rather than stopping at the first", () => {
    expect(validateProduction(prod({ SESSION_SECRET: "changeme", PUBLIC_APP_URL: undefined }))).toHaveLength(2);
  });

  it("stays silent outside production, so dev and test keep their defaults", () => {
    for (const NODE_ENV of ["development", "test"] as const) {
      expect(
        validateProduction({ ...GOOD, NODE_ENV, SESSION_SECRET: "change-me", PUBLIC_APP_URL: undefined }),
      ).toEqual([]);
    }
  });
});

describe("MAIL_REDIRECT_TO in production", () => {
  it("is refused — it would silently stop every customer email", () => {
    const problems = validateProduction({
      NODE_ENV: "production",
      SESSION_SECRET: "a".repeat(48),
      PUBLIC_APP_URL: "https://robotat.sa",
      MAIL_REDIRECT_TO: "dev@example.com",
    } as never);
    expect(problems.some((p) => p.includes("MAIL_REDIRECT_TO"))).toBe(true);
  });

  it("is allowed outside production", () => {
    const problems = validateProduction({
      NODE_ENV: "development",
      SESSION_SECRET: "dev",
      MAIL_REDIRECT_TO: "dev@example.com",
    } as never);
    expect(problems).toEqual([]);
  });
});

/**
 * MAIL_FROM used to be the only mail variable nobody validated.
 *
 * MAIL_REDIRECT_TO, added in the same commit, got an .email() check and a production
 * refusal; this one was read straight out of process.env by notify.ts. A typo therefore
 * failed once per message, inside nodemailer, where nothing was looking — the split
 * exists precisely because SMTP_USER is often not an address (`resend`, an API key), so
 * this is a field somebody types by hand and easy to get wrong.
 *
 * The display-name form is the awkward part: it is the recommended setting, and a bare
 * .email() rejects it.
 */
describe("MAIL_FROM", () => {
  const base = { DATABASE_URL: "postgresql://user:pw@db:5432/robotat" };
  const parse = (MAIL_FROM?: string) => envSchema.safeParse({ ...base, MAIL_FROM });

  it.each([
    "hello@nasl-tech.com",
    "ROBOTAT <hello@nasl-tech.com>",
    "ROBOTAT by NASL <hello@nasl-tech.com>",
    "<hello@nasl-tech.com>",
  ])("accepts %s", (value) => {
    const result = parse(value);
    expect(result.success).toBe(true);
    // Kept verbatim — nodemailer wants the display name, not the bare address.
    if (result.success) expect(result.data.MAIL_FROM).toBe(value);
  });

  it.each([
    "resend", // an SMTP username mistaken for a sender
    "hello@", // half-typed
    "ROBOTAT <not-an-address>",
    "ROBOTAT hello@nasl-tech.com", // display name without the angle brackets
  ])("rejects %s at boot rather than per-message", (value) => {
    const result = parse(value);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toMatch(/MAIL_FROM/);
  });

  it("stays optional — unset falls back to SMTP_USER, as it always has", () => {
    expect(parse(undefined).success).toBe(true);
    expect(parse("").success).toBe(true);
  });
});
