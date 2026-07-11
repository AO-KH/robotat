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

describe("booking — guest contact path (POST /api/contact)", () => {
  it("returns prefilled WhatsApp + email links without an account", async () => {
    const res = await request(app)
      .post("/api/contact")
      .send({ name: "Ali", email: "ali@farm.sa", company: "Farm Co", landSize: "120" });
    expect(res.status).toBe(200);
    expect(res.body.whatsappUrl).toMatch(/^https:\/\/wa\.me\//);
    expect(res.body.mailtoUrl).toMatch(/^mailto:/);
    // The submitted details are encoded into the links.
    expect(decodeURIComponent(res.body.whatsappUrl)).toContain("Ali");
    expect(decodeURIComponent(res.body.mailtoUrl)).toContain("Farm Co");
  });

  it("rejects invalid contact input with 400", async () => {
    const res = await request(app).post("/api/contact").send({ name: "A", email: "not-an-email" });
    expect(res.status).toBe(400);
  });
});

describe("booking — signed-in assessment path (POST /api/assessments)", () => {
  it("requires authentication", async () => {
    const res = await request(app)
      .post("/api/assessments")
      .send({ name: "Test User", email: "test.user@example.com" });
    expect(res.status).toBe(401);
  });

  it("creates a booking tied to the user and lists it back", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser());

    const created = await agent.post("/api/assessments").send({
      name: "Test User",
      email: "test.user@example.com",
      company: "Green Fields",
      landSize: "85",
      location: "https://goo.gl/maps/x",
      message: "Vineyard rows",
    });
    expect(created.status).toBe(201);
    expect(created.body.assessment).toMatchObject({
      name: "Test User",
      company: "Green Fields",
      landSize: "85",
      status: "pending",
    });
    expect(created.body.assessment.userId).toBeTypeOf("number");
    expect(created.body.whatsappUrl).toMatch(/^https:\/\/wa\.me\//);
    expect(created.body.mailtoUrl).toMatch(/^mailto:/);

    const list = await agent.get("/api/assessments");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].company).toBe("Green Fields");
  });

  it("only lists the signed-in user's own bookings", async () => {
    const alice = request.agent(app);
    await alice.post("/api/auth/register").send(newUser({ email: "alice@example.com" }));
    await alice.post("/api/assessments").send({ name: "Alice", email: "alice@example.com" });

    const bob = request.agent(app);
    await bob.post("/api/auth/register").send(newUser({ email: "bob@example.com" }));

    const bobList = await bob.get("/api/assessments");
    expect(bobList.status).toBe(200);
    expect(bobList.body).toHaveLength(0); // Bob sees none of Alice's
  });
});
