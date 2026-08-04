import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { getApp, resetDb, closeDb, newUser, makeStaff } from "./helpers";

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

/** Register a user and return a bearer token for them (no session cookie involved). */
async function tokenFor(overrides = {}): Promise<string> {
  const creds = newUser(overrides);
  await request(app).post("/api/auth/register").send(creds);
  const res = await request(app)
    .post("/api/auth/token")
    .send({ email: creds.email, password: creds.password });
  return res.body.token as string;
}

describe("bearer token auth", () => {
  it("issues a token for valid credentials and never leaks the hash", async () => {
    await request(app).post("/api/auth/register").send(newUser());
    const res = await request(app)
      .post("/api/auth/token")
      .send({ email: "test.user@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.split(".")).toHaveLength(2); // payload.sig
    expect(res.body.user.email).toBe("test.user@example.com");
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("rejects bad credentials with 401", async () => {
    await request(app).post("/api/auth/register").send(newUser());
    const res = await request(app)
      .post("/api/auth/token")
      .send({ email: "test.user@example.com", password: "wrongpassword" });
    expect(res.status).toBe(401);
  });

  it("authenticates GET /api/auth/me with a bearer token and no cookie", async () => {
    const token = await tokenFor();

    const anon = await request(app).get("/api/auth/me");
    expect(anon.status).toBe(401);

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("test.user@example.com");
  });

  it("authorizes a protected route with a bearer token", async () => {
    const token = await tokenFor();
    const res = await request(app).get("/api/assessments").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("ignores malformed or tampered tokens", async () => {
    const token = await tokenFor();

    const garbage = await request(app).get("/api/auth/me").set("Authorization", "Bearer not.a.real.token");
    expect(garbage.status).toBe(401);

    // Flip the last character of the signature → signature mismatch.
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    const bad = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${tampered}`);
    expect(bad.status).toBe(401);
  });

  it("a password reset revokes tokens issued before it", async () => {
    const token = await tokenFor();
    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`)).status).toBe(200);

    // Full forgot → reset cycle, as a user who thinks they've been compromised would.
    const forgot = await request(app).post("/api/auth/forgot-password").send({ email: "test.user@example.com" });
    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: forgot.body.devToken, newPassword: "brand-new-pass" });
    expect(reset.status).toBe(200);

    // The attacker's stolen token must now be dead — this was valid for 30 days before.
    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`)).status).toBe(401);

    // ...and a freshly minted one still works.
    const fresh = await request(app)
      .post("/api/auth/token")
      .send({ email: "test.user@example.com", password: "brand-new-pass" });
    expect(fresh.status).toBe(200);
    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${fresh.body.token}`)).status).toBe(
      200,
    );
  });

  it("a password change revokes tokens issued before it", async () => {
    const agent = request.agent(app);
    const creds = newUser();
    await agent.post("/api/auth/register").send(creds);
    const token = (
      await request(app).post("/api/auth/token").send({ email: creds.email, password: creds.password })
    ).body.token as string;

    const changed = await agent
      .patch("/api/auth/password")
      .send({ currentPassword: creds.password, newPassword: "changed-pass-1" });
    expect(changed.status).toBe(200);

    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`)).status).toBe(401);
    // The session that performed the change is deliberately preserved.
    expect((await agent.get("/api/auth/me")).status).toBe(200);
  });

  it("a password change evicts sessions on other devices but not the current one", async () => {
    const creds = newUser();
    const phone = request.agent(app);
    const laptop = request.agent(app);

    await phone.post("/api/auth/register").send(creds);
    await laptop.post("/api/auth/login").send({ email: creds.email, password: creds.password });
    expect((await phone.get("/api/auth/me")).status).toBe(200);
    expect((await laptop.get("/api/auth/me")).status).toBe(200);

    // The user changes their password on the laptop.
    const changed = await laptop
      .patch("/api/auth/password")
      .send({ currentPassword: creds.password, newPassword: "changed-pass-2" });
    expect(changed.status).toBe(200);

    // The other device's session is gone — this is what makes a password change a
    // real remediation rather than a cosmetic one.
    expect((await phone.get("/api/auth/me")).status).toBe(401);
    expect((await laptop.get("/api/auth/me")).status).toBe(200);
  });

  it("rejects a token whose version claim is forged", async () => {
    const token = await tokenFor();
    const [payload] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims.ver).toBe(0); // pinned to the user's current tokenVersion

    // Re-signing is impossible without SESSION_SECRET, so a bumped ver fails the HMAC.
    const forged = Buffer.from(JSON.stringify({ ...claims, ver: 99 })).toString("base64url");
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${forged}.${token.split(".")[1]}`);
    expect(res.status).toBe(401);
  });

  it("carries the staff role through a bearer token", async () => {
    const creds = newUser({ email: "staff.user@example.com" });
    await request(app).post("/api/auth/register").send(creds);
    await makeStaff(creds.email);
    const res = await request(app)
      .post("/api/auth/token")
      .send({ email: creds.email, password: creds.password });
    const token = res.body.token as string;

    const admin = await request(app).get("/api/admin/assessments").set("Authorization", `Bearer ${token}`);
    expect(admin.status).toBe(200);

    // A non-staff bearer is forbidden from the same route.
    const customerToken = await tokenFor();
    const denied = await request(app).get("/api/admin/assessments").set("Authorization", `Bearer ${customerToken}`);
    expect(denied.status).toBe(403);
  });
});
