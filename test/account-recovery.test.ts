import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { getApp, resetDb, closeDb, newUser } from "./helpers";
import { pool } from "../server/lib/db";
import { MAX_VERIFY_ATTEMPTS } from "../server/modules/auth/auth.service";

let app: Express;

beforeAll(async () => {
  app = await getApp();
});
beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});

describe("password reset", () => {
  it("new accounts start unverified", async () => {
    const res = await request(app).post("/api/auth/register").send(newUser());
    expect(res.status).toBe(201);
    expect(res.body.emailVerified).toBe(false);
  });

  it("forgot-password returns 200 without leaking whether the email exists", async () => {
    await request(app).post("/api/auth/register").send(newUser());

    const known = await request(app).post("/api/auth/forgot-password").send({ email: "test.user@example.com" });
    expect(known.status).toBe(200);
    expect(known.body.ok).toBe(true);
    expect(typeof known.body.devToken).toBe("string"); // dev-only, present in test env

    const unknown = await request(app).post("/api/auth/forgot-password").send({ email: "nobody@example.com" });
    expect(unknown.status).toBe(200);
    expect(unknown.body.ok).toBe(true);
    expect(unknown.body.devToken).toBeUndefined(); // no token minted → nothing leaked
  });

  it("resets the password with a valid token and enforces single use", async () => {
    await request(app).post("/api/auth/register").send(newUser());
    const forgot = await request(app).post("/api/auth/forgot-password").send({ email: "test.user@example.com" });
    const token = forgot.body.devToken as string;

    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, newPassword: "brand-new-pass" });
    expect(reset.status).toBe(200);

    // Old password no longer works; new one does.
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "test.user@example.com", password: "password123" });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "test.user@example.com", password: "brand-new-pass" });
    expect(newLogin.status).toBe(200);

    // The token cannot be reused.
    const reuse = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, newPassword: "another-pass" });
    expect(reuse.status).toBe(400);
  });

  it("a successful reset also marks the email verified", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser());
    const forgot = await request(app).post("/api/auth/forgot-password").send({ email: "test.user@example.com" });
    await request(app)
      .post("/api/auth/reset-password")
      .send({ token: forgot.body.devToken, newPassword: "brand-new-pass" });

    const relogin = await agent
      .post("/api/auth/login")
      .send({ email: "test.user@example.com", password: "brand-new-pass" });
    expect(relogin.body.emailVerified).toBe(true);
  });

  it("rejects an invalid or expired reset token", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "not-a-real-token", newPassword: "whatever123" });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("token");
  });
});

describe("email verification", () => {
  /** Register and return the agent plus the 6-digit code that was emailed. */
  async function registerAndGetCode(email = "test.user@example.com") {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser({ email }));
    // Outside production the code comes back in the response so tests need no inbox.
    const resend = await agent.post("/api/auth/resend-verification").send({});
    return { agent, code: resend.body.devToken as string };
  }

  it("verifies with the 6-digit code and flips me.emailVerified", async () => {
    const { agent, code } = await registerAndGetCode();
    expect(code).toMatch(/^\d{6}$/);

    const verify = await agent.post("/api/auth/verify-email").send({ code });
    expect(verify.status).toBe(200);
    expect(verify.body.emailVerified).toBe(true);

    const me = await agent.get("/api/auth/me");
    expect(me.body.emailVerified).toBe(true);
  });

  it("accepts a code pasted with spaces in it", async () => {
    // "123 456" is what comes out of an email when someone selects the digits.
    const { agent, code } = await registerAndGetCode();
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect((await agent.post("/api/auth/verify-email").send({ code: spaced })).status).toBe(200);
  });

  it("needs the session that asked for the code", async () => {
    // The whole reason this endpoint is authed: six digits are not unique across
    // accounts, so a code with no session attached could only ever be guessed at
    // someone else's account.
    const { code } = await registerAndGetCode();
    expect((await request(app).post("/api/auth/verify-email").send({ code })).status).toBe(401);
  });

  it("rejects a wrong code, and burns the code after five tries", async () => {
    const { agent, code } = await registerAndGetCode();
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");

    for (let i = 0; i < 4; i++) {
      const res = await agent.post("/api/auth/verify-email").send({ code: wrong });
      expect(res.status).toBe(400);
    }

    // Fifth wrong guess exhausts it...
    expect((await agent.post("/api/auth/verify-email").send({ code: wrong })).status).toBe(429);
    // ...and the real code is dead too, so guessing cannot be resumed by getting lucky.
    expect((await agent.post("/api/auth/verify-email").send({ code })).status).toBe(400);
  });

  it("holds the five-attempt limit against a concurrent burst", async () => {
    /*
      The limit has to survive requests that arrive together, not just requests that
      arrive in a line.

      Reading `attempts`, comparing it, and only then incrementing is three statements,
      and everything that arrives before the first increment commits reads the same
      pre-increment value. A burst therefore buys far more than five guesses against one
      code — 84 recorded attempts out of 200 concurrent requests here before the fix, with
      the connection pool the only thing throttling it. Counting the guesses the database
      actually recorded is the assertion, because the HTTP statuses cannot distinguish
      "refused" from "counted and refused". Sixty rather than two hundred only because it
      already reproduced at 52 there and the suite runs serially.
    */
    const { agent, code } = await registerAndGetCode();
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");

    const BURST = 60;
    await Promise.all(
      Array.from({ length: BURST }, () => agent.post("/api/auth/verify-email").send({ code: wrong })),
    );

    const { rows } = await pool.query<{ attempts: number }>(
      "SELECT attempts FROM auth_tokens WHERE kind = 'email_verification'",
    );
    const recorded = rows.reduce((sum, r) => sum + Number(r.attempts), 0);
    expect(recorded).toBeLessThanOrEqual(MAX_VERIFY_ATTEMPTS);

    // And the budget being spent has to actually kill the code, not merely start
    // refusing: a burst that ends with the real code still redeemable would mean the
    // attacker keeps guessing for as long as the fifteen-minute window lasts.
    expect((await agent.post("/api/auth/verify-email").send({ code })).status).toBe(400);
  });

  it("issues a new code on resend and retires the old one", async () => {
    const { agent, code: first } = await registerAndGetCode();
    const second = (await agent.post("/api/auth/resend-verification").send({})).body.devToken as string;

    expect(second).not.toBe(first);
    expect((await agent.post("/api/auth/verify-email").send({ code: first })).status).toBe(400);
    expect((await agent.post("/api/auth/verify-email").send({ code: second })).status).toBe(200);
  });

  it("rejects anything that is not six digits", async () => {
    const { agent } = await registerAndGetCode();
    for (const code of ["12345", "1234567", "abcdef", ""]) {
      expect((await agent.post("/api/auth/verify-email").send({ code })).status).toBe(400);
    }
  });

  it("resend on an already-verified account reports alreadyVerified", async () => {
    const { agent, code } = await registerAndGetCode();
    await agent.post("/api/auth/verify-email").send({ code });

    const second = await agent.post("/api/auth/resend-verification").send({});
    expect(second.status).toBe(200);
    expect(second.body.alreadyVerified).toBe(true);
  });

  it("requires authentication to resend verification", async () => {
    const res = await request(app).post("/api/auth/resend-verification").send({});
    expect(res.status).toBe(401);
  });
});
