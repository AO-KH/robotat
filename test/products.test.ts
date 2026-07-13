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

describe("products (GET /api/products)", () => {
  it("returns the seeded fleet catalogue, sorted, with bilingual fields + specs", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);

    // Ordered by sort_order — platform first.
    expect(res.body[0].slug).toBe("max-t100");
    expect(res.body[0].kind).toBe("platform");

    const p = res.body[0];
    expect(p.roleEn).toBeTruthy();
    expect(p.roleAr).toBeTruthy();
    expect(p.descriptionAr).toBeTruthy();
    expect(Array.isArray(p.specs)).toBe(true);
    expect(p.specs[0]).toHaveProperty("labelAr");
    expect(p.specs[0]).toHaveProperty("valueEn");
  });
});
