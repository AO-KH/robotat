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
