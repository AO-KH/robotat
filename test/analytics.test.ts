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

describe("analytics ingest (POST /api/analytics/events)", () => {
  it("accepts a valid event (202) and rejects a missing type (400)", async () => {
    expect((await request(app).post("/api/analytics/events").send({ type: "page_view", path: "/" })).status).toBe(202);
    expect((await request(app).post("/api/analytics/events").send({ path: "/" })).status).toBe(400);
  });
});

describe("analytics summary (GET /api/admin/analytics)", () => {
  it("is staff-guarded and aggregates page views, unique visitors, and the funnel", async () => {
    const send = (body: object) => request(app).post("/api/analytics/events").send(body);
    await send({ type: "page_view", path: "/", visitorId: "v1" });
    await send({ type: "page_view", path: "/", visitorId: "v1" });
    await send({ type: "page_view", path: "/fleet", visitorId: "v2" });
    await send({ type: "booking_open", visitorId: "v2" });
    await send({ type: "booking_submitted", visitorId: "v2" });

    // anonymous → 401, non-staff → 403
    expect((await request(app).get("/api/admin/analytics")).status).toBe(401);
    const cust = request.agent(app);
    await cust.post("/api/auth/register").send(newUser({ email: "c@example.com" }));
    expect((await cust.get("/api/admin/analytics")).status).toBe(403);

    // staff → 200 with aggregates
    const staff = request.agent(app);
    await staff.post("/api/auth/register").send(newUser({ email: "s@example.com" }));
    await makeStaff("s@example.com");

    const res = await staff.get("/api/admin/analytics");
    expect(res.status).toBe(200);
    expect(res.body.totalPageViews).toBe(3);
    expect(res.body.uniqueVisitors).toBe(2);
    expect(res.body.topPaths[0]).toMatchObject({ path: "/", views: 2 });
    expect(res.body.funnel.opened).toBe(1);
    expect(res.body.funnel.submitted).toBe(1);
  });
});
