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
