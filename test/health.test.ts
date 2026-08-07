import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { getApp, closeDb } from "./helpers";

let app: Express;
beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await closeDb();
});

describe("health endpoints", () => {
  it("liveness answers without touching the database", async () => {
    // Deliberately dependency-free: it answers "the process is up", which is the only
    // question a restart policy should act on.
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("readiness reports on the database it actually needs", async () => {
    const res = await request(app).get("/api/ready");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, database: "up" });
  });
});
