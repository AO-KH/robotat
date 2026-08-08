import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { getApp, resetDb, closeDb, newUser } from "./helpers";
import { pool } from "../server/lib/db";
import { MAX_VERIFY_ATTEMPTS, hashToken } from "../server/modules/auth/auth.service";

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

  it("lets the mailbox owner recover an account squatted under an alias", async () => {
    /*
      Registration rejects any address whose canonical form is taken, so one request from
      an unauthenticated stranger occupies a whole Gmail alias family permanently. If reset
      matched literally too, the real owner had no door left: registration 409s, sign-in
      looks up the literal address and finds nothing, and reset answered with the same
      silent 200 it gives a typo. Resolving by canonical form is what makes the squat
      recoverable — and it is safe here precisely because the link is emailed to the stored
      address, which is the owner's own mailbox.
    */
    const squatted = "a.bdullah@gmail.com";
    const owner = "abdullah@gmail.com";
    await request(app).post("/api/auth/register").send(newUser({ email: squatted }));

    const forgot = await request(app).post("/api/auth/forgot-password").send({ email: owner });
    expect(forgot.status).toBe(200);
    expect(typeof forgot.body.devToken).toBe("string");

    // The token has to belong to the squatted account, not merely exist.
    const { rows } = await pool.query<{ email: string }>(
      `SELECT u.email FROM auth_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.kind = 'password_reset' AND t.used_at IS NULL`,
    );
    expect(rows.map((r) => r.email)).toEqual([squatted]);

    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: forgot.body.devToken, newPassword: "reclaimed-pass" });
    expect(reset.status).toBe(200);

    // Sign-in still matches the literal address the account was registered under — which
    // the owner can read off the To: line of the reset email they just received.
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: squatted, password: "reclaimed-pass" });
    expect(login.status).toBe(200);
  });

  it("does not resolve a reset to a different person's account", async () => {
    // Widening the lookup must not merge people the canonicaliser was never meant to
    // fold: dots are significant outside Google, so these are two separate mailboxes.
    await request(app).post("/api/auth/register").send(newUser({ email: "first.last@outlook.com" }));

    const other = await request(app).post("/api/auth/forgot-password").send({ email: "firstlast@outlook.com" });
    expect(other.status).toBe(200);
    expect(other.body.devToken).toBeUndefined(); // no user matched → nothing minted

    // The +suffix form of the same Outlook address is the same mailbox, so that one does.
    const alias = await request(app).post("/api/auth/forgot-password").send({ email: "first.last+farm@outlook.com" });
    expect(typeof alias.body.devToken).toBe("string");
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

  it("leaves exactly one live code, the newest, when resends race", async () => {
    /*
      Retiring the old code and inserting the new one used to be two statements with a gap
      between them, and concurrent resends both invalidate before either inserts. That left
      more than one live code for the account, and the unordered lookup then picked the
      oldest — so the customer who double-tapped "resend" was holding a code the server had
      decided to reject, while the one it would accept was in an earlier email.
    */
    const { agent } = await registerAndGetCode();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => agent.post("/api/auth/resend-verification").send({})),
    );
    const codes = responses.map((r) => r.body.devToken as string);

    const { rows } = await pool.query<{ id: number; token_hash: string }>(
      `SELECT id, token_hash FROM auth_tokens
       WHERE kind = 'email_verification' AND used_at IS NULL ORDER BY id DESC`,
    );
    expect(rows).toHaveLength(1);

    // And it is the last row written, not an earlier one that happened to survive.
    const { rows: all } = await pool.query<{ max: number }>(
      "SELECT max(id)::int AS max FROM auth_tokens WHERE kind = 'email_verification'",
    );
    expect(rows[0].id).toBe(all[0].max);

    // The survivor belongs to one of the resends the customer actually heard back from —
    // not to some row they were never told about.
    const winners = codes.filter((c) => hashToken(c) === rows[0].token_hash);
    expect(winners).toHaveLength(1);

    // Order matters: a losing code has to be refused while the account is still
    // unverified, because after a success the route short-circuits and returns 200 to
    // anything.
    const loser = codes.find((c) => c !== winners[0]);
    expect((await agent.post("/api/auth/verify-email").send({ code: loser })).status).toBe(400);
    expect((await agent.post("/api/auth/verify-email").send({ code: winners[0] })).status).toBe(200);
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
