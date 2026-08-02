import { describe, it, expect } from "vitest";
import { validateProduction, type Env } from "../server/lib/env";

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
  PUBLIC_APP_URL: "https://robotat.nasl-tech.com",
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
    expect(validateProduction(prod({ PUBLIC_APP_URL: "http://robotat.nasl-tech.com" }))[0]).toMatch(/https/);
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
