import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { getApp, resetDb, closeDb, newUser, verifyUser } from "./helpers";
import { pool } from "../server/lib/db";

/**
 * In-app account deletion (App Store Guideline 5.1.1(v)).
 *
 * The interesting assertions are not on the API response but on the rows left behind:
 * a booking records a site visit ROBOTAT actually performed, so it survives the
 * deletion — stripped of everything that identifies the customer.
 */

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

/** Read a row straight from the database — the API deliberately can't see these. */
async function assessmentRow(id: number) {
  const { rows } = await pool.query("SELECT * FROM assessments WHERE id = $1", [id]);
  return rows[0];
}

async function userCount(email: string): Promise<number> {
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM users WHERE email = $1", [email.toLowerCase()]);
  return rows[0].n;
}

describe("delete account (DELETE /api/auth/account)", () => {
  it("requires a signed-in user", async () => {
    const res = await request(app).delete("/api/auth/account").send({ password: "password123" });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong password and leaves the account intact", async () => {
    const agent = request.agent(app);
    const creds = newUser();
    await agent.post("/api/auth/register").send(creds);

    const res = await agent.delete("/api/auth/account").send({ password: "not-my-password" });
    expect(res.status).toBe(401);

    // The account is still there, and still usable.
    expect(await userCount(creds.email)).toBe(1);
    expect((await agent.get("/api/auth/me")).status).toBe(200);
  });

  it("deletes the user and stops the session authenticating", async () => {
    const agent = request.agent(app);
    const creds = newUser();
    await agent.post("/api/auth/register").send(creds);

    const res = await agent.delete("/api/auth/account").send({ password: creds.password });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    expect(await userCount(creds.email)).toBe(0);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
    // The credentials are gone too — this is deletion, not deactivation.
    expect((await request(app).post("/api/auth/login").send(creds)).status).toBe(401);
  });

  it("keeps the booking but strips every trace of the person from it", async () => {
    const agent = request.agent(app);
    const creds = newUser({ email: "fahad@sunfarms.example" });
    await agent.post("/api/auth/register").send(creds);
    await verifyUser(creds.email);

    const booking = {
      name: "Fahad Al-Qahtani",
      email: "fahad@sunfarms.example",
      phone: "+966500112233",
      company: "Sun Farms Trading",
      landSize: "120 hectares",
      location: "Al Kharj, Riyadh Province",
      // Free text, and exactly why `message` has to be scrubbed as well.
      message: "Reach me on +966500112233 — the gate is off Exit 14, past the palm rows.",
    };
    const created = await agent.post("/api/assessments").send(booking);
    expect(created.status).toBe(201);
    const id: number = created.body.assessment.id;

    const before = await assessmentRow(id);
    expect(before.name).toBe(booking.name);
    expect(before.user_id).not.toBeNull();

    expect((await agent.delete("/api/auth/account").send({ password: creds.password })).status).toBe(200);

    const after = await assessmentRow(id);
    // The visit still happened, so the row is still here.
    expect(after).toBeDefined();

    // Detached from the account, and every identifying column emptied.
    expect(after.user_id).toBeNull();
    expect(after.name).toBe("[deleted]");
    expect(after.email).toBe("[deleted]");
    expect(after.phone).toBeNull();
    expect(after.company).toBeNull();
    expect(after.location).toBeNull();
    expect(after.message).toBeNull();

    // ...but the facts about the visit itself are untouched.
    expect(after.land_size).toBe(booking.landSize);
    expect(after.status).toBe(before.status);
    expect(after.created_at).toEqual(before.created_at);
    expect(after.scheduled_at).toEqual(before.scheduled_at);
  });

  it("detaches analytics events instead of deleting them", async () => {
    const agent = request.agent(app);
    const creds = newUser();
    const registered = await agent.post("/api/auth/register").send(creds);
    const userId: number = registered.body.id;

    // Signed-in events are recorded against the user id.
    expect((await agent.post("/api/analytics/events").send({ type: "booking_open", visitorId: "v1" })).status).toBe(202);
    const before = await pool.query("SELECT id, user_id FROM analytics_events WHERE user_id = $1", [userId]);
    expect(before.rowCount).toBe(1);
    const eventId = before.rows[0].id;

    expect((await agent.delete("/api/auth/account").send({ password: creds.password })).status).toBe(200);

    // The event still counts toward the funnel; it just stops being attributable.
    const after = await pool.query("SELECT user_id, type FROM analytics_events WHERE id = $1", [eventId]);
    expect(after.rowCount).toBe(1);
    expect(after.rows[0].user_id).toBeNull();
    expect(after.rows[0].type).toBe("booking_open");
  });

  it("kills bearer tokens with the account (the native app's path)", async () => {
    const creds = newUser();
    await request(app).post("/api/auth/register").send(creds);
    const issued = await request(app)
      .post("/api/auth/token")
      .send({ email: creds.email, password: creds.password });
    const token: string = issued.body.token;
    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`)).status).toBe(200);

    // Delete over the bearer token itself — the iOS app has no session cookie.
    const res = await request(app)
      .delete("/api/auth/account")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: creds.password });
    expect(res.status).toBe(200);

    // The token is stateless, but it resolves through the user row, which is gone.
    expect((await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`)).status).toBe(401);
  });
});
