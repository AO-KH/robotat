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

/** Register a customer and create one booking; returns the agent + new assessment id. */
async function customerWithBooking(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(newUser({ email }));
  const res = await agent.post("/api/assessments").send({ name: "Customer", email });
  return { agent, assessmentId: res.body.assessment.id as number };
}

/** Register a user and promote them to staff. */
async function staffAgent(email = "staff@example.com") {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(newUser({ email }));
  await makeStaff(email); // deserializeUser reloads the row, so the next request is staff
  return agent;
}

describe("admin — access control", () => {
  it("401 when not signed in", async () => {
    expect((await request(app).get("/api/admin/assessments")).status).toBe(401);
  });

  it("403 for a signed-in non-staff user (GET and PATCH)", async () => {
    const { agent } = await customerWithBooking("cust@example.com");
    expect((await agent.get("/api/admin/assessments")).status).toBe(403);
    expect((await agent.patch("/api/admin/assessments/1").send({ status: "scheduled" })).status).toBe(403);
  });
});

describe("admin — assessments", () => {
  it("staff lists every booking across users", async () => {
    await customerWithBooking("a@example.com");
    await customerWithBooking("b@example.com");

    const staff = await staffAgent();
    const res = await staff.get("/api/admin/assessments");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("staff filters by status", async () => {
    const { assessmentId } = await customerWithBooking("a@example.com");
    const staff = await staffAgent();
    await staff.patch(`/api/admin/assessments/${assessmentId}`).send({ status: "scheduled" });

    expect((await staff.get("/api/admin/assessments?status=pending")).body).toHaveLength(0);
    expect((await staff.get("/api/admin/assessments?status=scheduled")).body).toHaveLength(1);
  });

  it("staff updates status and the scheduled date", async () => {
    const { assessmentId } = await customerWithBooking("a@example.com");
    const staff = await staffAgent();

    const when = "2026-08-01T09:00:00.000Z";
    const res = await staff
      .patch(`/api/admin/assessments/${assessmentId}`)
      .send({ status: "scheduled", scheduledAt: when });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("scheduled");
    expect(new Date(res.body.scheduledAt).toISOString()).toBe(when);
  });

  it("rejects an invalid status (400) and a missing booking (404)", async () => {
    const staff = await staffAgent();
    expect((await staff.patch("/api/admin/assessments/1").send({ status: "bogus" })).status).toBe(400);
    expect((await staff.patch("/api/admin/assessments/9999").send({ status: "scheduled" })).status).toBe(404);
  });
});

describe("admin — user list", () => {
  it("is staff-only: 401 signed out, 403 as a customer", async () => {
    expect((await request(app).get("/api/admin/users")).status).toBe(401);
    const { agent } = await customerWithBooking("nosy@example.com");
    expect((await agent.get("/api/admin/users")).status).toBe(403);
  });

  it("never returns the password hash", async () => {
    // The query names its columns instead of selecting the whole row. This asserts the
    // outcome rather than the technique, so it still holds if the query is rewritten.
    await customerWithBooking("hash@example.com");
    const staff = await staffAgent();

    const res = await staff.get("/api/admin/users");
    expect(res.status).toBe(200);
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toMatch(/passwordHash|password_hash/);
    // The scrypt hashes this app writes are "<hex>.<hex>"; make sure no field carries one.
    expect(serialised).not.toMatch(/[0-9a-f]{32,}\.[0-9a-f]{16,}/);
  });

  it("counts each account's bookings, and lists accounts that have none", async () => {
    const buyer = request.agent(app);
    await buyer.post("/api/auth/register").send(newUser({ email: "buyer@example.com" }));
    await buyer.post("/api/assessments").send({ name: "Buyer", email: "buyer@example.com" });
    await buyer.post("/api/assessments").send({ name: "Buyer", email: "buyer@example.com" });

    // Registered, never booked — the row most worth seeing, and the one an inner join
    // would silently drop.
    const lurker = request.agent(app);
    await lurker.post("/api/auth/register").send(newUser({ email: "lurker@example.com" }));

    const staff = await staffAgent();
    const res = await staff.get("/api/admin/users");

    const byEmail = Object.fromEntries(res.body.map((u: { email: string }) => [u.email, u]));
    expect(byEmail["buyer@example.com"].bookingCount).toBe(2);
    expect(byEmail["lurker@example.com"].bookingCount).toBe(0);
    expect(byEmail["lurker@example.com"].lastBookingAt).toBeNull();
    expect(byEmail["buyer@example.com"].lastBookingAt).not.toBeNull();
  });

  it("carries the fields staff actually need", async () => {
    await customerWithBooking("ar.user@example.com");
    const staff = await staffAgent();
    const res = await staff.get("/api/admin/users");
    const row = res.body.find((u: { email: string }) => u.email === "ar.user@example.com");

    expect(row).toMatchObject({ role: "customer", emailVerified: false, locale: "en" });
    expect(typeof row.name).toBe("string");
    expect(row.createdAt).toBeTruthy();
  });
});
