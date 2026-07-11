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

describe("auth", () => {
  it("registers a user, logs them in, and never returns the password hash", async () => {
    const res = await request(app).post("/api/auth/register").send(newUser());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Test User", email: "test.user@example.com" });
    expect(res.body).not.toHaveProperty("passwordHash");
    expect(res.body).not.toHaveProperty("password");
    // Registration logs the user in → a session cookie is set.
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects a duplicate email with 409", async () => {
    await request(app).post("/api/auth/register").send(newUser());
    const res = await request(app).post("/api/auth/register").send(newUser());
    expect(res.status).toBe(409);
    expect(res.body.field).toBe("email");
  });

  it("rejects invalid registration input with 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(newUser({ password: "short" }));
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("password");
  });

  it("GET /api/auth/me is 401 when signed out and returns the user when signed in", async () => {
    const agent = request.agent(app);
    const anon = await agent.get("/api/auth/me");
    expect(anon.status).toBe(401);

    await agent.post("/api/auth/register").send(newUser());
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("test.user@example.com");
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    await request(app).post("/api/auth/register").send(newUser());

    const bad = await request(app)
      .post("/api/auth/login")
      .send({ email: "test.user@example.com", password: "wrongpassword" });
    expect(bad.status).toBe(401);

    const good = await request(app)
      .post("/api/auth/login")
      .send({ email: "test.user@example.com", password: "password123" });
    expect(good.status).toBe(200);
    expect(good.body.email).toBe("test.user@example.com");
  });

  it("logs out: after logout, /me is 401 again", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser());
    expect((await agent.get("/api/auth/me")).status).toBe(200);

    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(200);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });
});
