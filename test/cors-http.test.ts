import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { getApp } from "./helpers";

let app: Express;
beforeAll(async () => {
  app = await getApp();
});

describe("cors over HTTP", () => {
  const NATIVE = "capacitor://localhost";

  it("answers a preflight from the app with 204 and the right headers", async () => {
    const res = await request(app)
      .options("/api/auth/me")
      .set("Origin", NATIVE)
      .set("Access-Control-Request-Method", "GET");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(NATIVE);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-headers"]).toContain("Authorization");
    expect(res.headers["vary"]).toContain("Origin");
  });

  it("echoes the origin on a real request", async () => {
    const res = await request(app).get("/api/health").set("Origin", NATIVE);
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(NATIVE);
  });

  it("sends no CORS headers to an unlisted origin", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://evil.example");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    // Still varies on Origin so a cache cannot serve this to an allowed origin.
    expect(res.headers["vary"]).toContain("Origin");
  });

  it("leaves same-origin requests completely untouched", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
