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

describe("assessment detail (GET /api/assessments/:id)", () => {
  it("returns the owner's booking and 404s for someone else's", async () => {
    const owner = request.agent(app);
    await owner.post("/api/auth/register").send(newUser({ email: "owner@example.com" }));
    const created = await owner.post("/api/assessments").send({ name: "Owner", email: "owner@example.com" });
    const id = created.body.assessment.id;

    const mine = await owner.get(`/api/assessments/${id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.id).toBe(id);

    const other = request.agent(app);
    await other.post("/api/auth/register").send(newUser({ email: "other@example.com" }));
    expect((await other.get(`/api/assessments/${id}`)).status).toBe(404); // not theirs
    expect((await request(app).get(`/api/assessments/${id}`)).status).toBe(401); // signed out
  });
});

describe("profile (PATCH /api/auth/profile)", () => {
  it("updates the name", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser());
    const res = await agent.patch("/api/auth/profile").send({ name: "New Name" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New Name");
    expect((await agent.get("/api/auth/me")).body.name).toBe("New Name");
  });

  it("requires auth", async () => {
    expect((await request(app).patch("/api/auth/profile").send({ name: "X" })).status).toBe(401);
  });
});

describe("change password (PATCH /api/auth/password)", () => {
  it("changes the password when the current one is correct", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser({ password: "password123" }));

    const res = await agent
      .patch("/api/auth/password")
      .send({ currentPassword: "password123", newPassword: "newpassword456" });
    expect(res.status).toBe(200);

    // Old password no longer works; new one does.
    const fresh = request.agent(app);
    expect((await fresh.post("/api/auth/login").send({ email: newUser().email, password: "password123" })).status).toBe(401);
    expect((await fresh.post("/api/auth/login").send({ email: newUser().email, password: "newpassword456" })).status).toBe(200);
  });

  it("rejects a wrong current password (400) and a too-short new one (400)", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser({ password: "password123" }));

    const wrong = await agent
      .patch("/api/auth/password")
      .send({ currentPassword: "nope", newPassword: "newpassword456" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.field).toBe("currentPassword");

    const short = await agent
      .patch("/api/auth/password")
      .send({ currentPassword: "password123", newPassword: "short" });
    expect(short.status).toBe(400);
  });
});
