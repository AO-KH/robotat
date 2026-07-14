import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { getApp, resetDb, closeDb, newUser } from "./helpers";

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
  it("verifies an email via a token and flips me.emailVerified", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser());

    // Grab a fresh verification token via resend (authed).
    const resend = await agent.post("/api/auth/resend-verification").send({});
    expect(resend.status).toBe(200);
    const token = resend.body.devToken as string;
    expect(typeof token).toBe("string");

    const verify = await request(app).post("/api/auth/verify-email").send({ token });
    expect(verify.status).toBe(200);
    expect(verify.body.emailVerified).toBe(true);

    const me = await agent.get("/api/auth/me");
    expect(me.body.emailVerified).toBe(true);

    // Single use: the same token can't verify again.
    const again = await request(app).post("/api/auth/verify-email").send({ token });
    expect(again.status).toBe(400);
  });

  it("resend on an already-verified account reports alreadyVerified", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser());
    const resend = await agent.post("/api/auth/resend-verification").send({});
    await request(app).post("/api/auth/verify-email").send({ token: resend.body.devToken });

    const second = await agent.post("/api/auth/resend-verification").send({});
    expect(second.status).toBe(200);
    expect(second.body.alreadyVerified).toBe(true);
  });

  it("requires authentication to resend verification", async () => {
    const res = await request(app).post("/api/auth/resend-verification").send({});
    expect(res.status).toBe(401);
  });
});
