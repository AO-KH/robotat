import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { DAILY_ASSESSMENT_LIMIT } from "@shared/schema";
import { getApp, resetDb, closeDb, newUser, ageAllAssessments, verifyUser } from "./helpers";

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
    await verifyUser("test.user@example.com");

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

  it("refuses to book until the email address is confirmed", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser({ email: "unconfirmed@example.com" }));

    const blocked = await agent
      .post("/api/assessments")
      .send({ name: "Unconfirmed", email: "unconfirmed@example.com" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.field).toBe("emailVerified");

    // Signing in and reading stay open — only the booking is held back.
    expect((await agent.get("/api/auth/me")).status).toBe(200);
    expect((await agent.get("/api/assessments")).status).toBe(200);

    // And nothing was written.
    expect((await agent.get("/api/assessments")).body).toHaveLength(0);
  });

  it("lets the same account book the moment it confirms", async () => {
    // The route re-reads the user rather than trusting the session copy, so confirming
    // on another device works without signing out and back in here.
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser({ email: "later@example.com" }));
    expect((await agent.post("/api/assessments").send({ name: "Layla", email: "later@example.com" })).status).toBe(403);

    await verifyUser("later@example.com");
    expect((await agent.post("/api/assessments").send({ name: "Layla", email: "later@example.com" })).status).toBe(201);
  });

  it("records the language the booking was made in", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser({ email: "sara@example.com" }));
    await verifyUser("sara@example.com");
    const created = await agent
      .post("/api/assessments")
      .send({ name: "سارة", email: "sara@example.com", locale: "ar" });

    expect(created.status).toBe(201);
    expect(created.body.assessment.locale).toBe("ar");
  });

  it("falls back to the account's language when the client sends none", async () => {
    // A shipped iOS build that predates this field sends no locale. Without the
    // fallback, someone who registered in Arabic would start getting English the
    // moment they booked.
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser({ email: "ar.user@example.com", locale: "ar" }));
    await verifyUser("ar.user@example.com");
    const created = await agent
      .post("/api/assessments")
      .send({ name: "سارة", email: "ar.user@example.com" });

    expect(created.status).toBe(201);
    expect(created.body.assessment.locale).toBe("ar");
  });

  it("rejects a language it cannot write, rather than storing it", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser({ email: "fr@example.com" }));
    await verifyUser("fr@example.com");
    const created = await agent
      .post("/api/assessments")
      .send({ name: "Luc", email: "fr@example.com", locale: "fr" });

    // Omitting the field is the compatibility case and is accepted (see above). Sending
    // a language with no dictionary behind it is a client bug, and storing it would mean
    // every later message silently resolved back to English with nothing recording why.
    expect(created.status).toBe(400);
  });

  it(`allows exactly ${DAILY_ASSESSMENT_LIMIT} bookings, then refuses with 429`, async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser({ email: "busy@example.com" }));
    await verifyUser("busy@example.com");

    for (let i = 0; i < DAILY_ASSESSMENT_LIMIT; i++) {
      const ok = await agent.post("/api/assessments").send({ name: "Busy", email: "busy@example.com" });
      expect(ok.status).toBe(201);
    }

    const blocked = await agent.post("/api/assessments").send({ name: "Busy", email: "busy@example.com" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toContain(String(DAILY_ASSESSMENT_LIMIT));

    // Refused, not silently dropped: the row must not exist.
    const list = await agent.get("/api/assessments");
    expect(list.body).toHaveLength(DAILY_ASSESSMENT_LIMIT);
  });

  it("holds the limit under simultaneous requests, not just sequential ones", async () => {
    // The check and the insert share a transaction, serialised on the account. Counting
    // first and inserting after would let several requests all read "two so far" and all
    // write — the exact race this fires eight at once to catch.
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser({ email: "racer@example.com" }));
    await verifyUser("racer@example.com");

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        agent.post("/api/assessments").send({ name: "Racer", email: "racer@example.com" }),
      ),
    );

    const created = results.filter((r) => r.status === 201).length;
    const refused = results.filter((r) => r.status === 429).length;
    expect(created).toBe(DAILY_ASSESSMENT_LIMIT);
    expect(refused).toBe(8 - DAILY_ASSESSMENT_LIMIT);

    // And the database agrees — no extra row slipped in behind a 429.
    const list = await agent.get("/api/assessments");
    expect(list.body).toHaveLength(DAILY_ASSESSMENT_LIMIT);
  });

  it("counts per account, so one user hitting the limit does not block another", async () => {
    // The reason this is counted in the database rather than by express-rate-limit:
    // that counts per IP, and in this test both accounts share one.
    const alice = request.agent(app);
    await alice.post("/api/auth/register").send(newUser({ email: "alice@example.com" }));
    await verifyUser("alice@example.com");
    for (let i = 0; i < DAILY_ASSESSMENT_LIMIT; i++) {
      await alice.post("/api/assessments").send({ name: "Alice", email: "alice@example.com" });
    }
    expect((await alice.post("/api/assessments").send({ name: "Alice", email: "alice@example.com" })).status).toBe(429);

    const bob = request.agent(app);
    await bob.post("/api/auth/register").send(newUser({ email: "bob2@example.com" }));
    await verifyUser("bob2@example.com");
    const bobFirst = await bob.post("/api/assessments").send({ name: "Bob", email: "bob2@example.com" });
    expect(bobFirst.status).toBe(201);
  });

  it("ignores bookings that have aged out of the window", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser({ email: "returning@example.com" }));
    await verifyUser("returning@example.com");
    for (let i = 0; i < DAILY_ASSESSMENT_LIMIT; i++) {
      await agent.post("/api/assessments").send({ name: "Returning", email: "returning@example.com" });
    }
    expect((await agent.post("/api/assessments").send({ name: "Returning", email: "returning@example.com" })).status).toBe(429);

    // Age them past the window. A rolling 24 hours means the allowance returns as the
    // oldest booking falls out of it, not at some fixed hour of the night.
    await ageAllAssessments();

    const afterwards = await agent.post("/api/assessments").send({ name: "Returning", email: "returning@example.com" });
    expect(afterwards.status).toBe(201);
  });

  it("only lists the signed-in user's own bookings", async () => {
    const alice = request.agent(app);
    await alice.post("/api/auth/register").send(newUser({ email: "alice@example.com" }));
    await verifyUser("alice@example.com");
    await alice.post("/api/assessments").send({ name: "Alice", email: "alice@example.com" });

    const bob = request.agent(app);
    await bob.post("/api/auth/register").send(newUser({ email: "bob@example.com" }));
    await verifyUser("bob@example.com");

    const bobList = await bob.get("/api/assessments");
    expect(bobList.status).toBe(200);
    expect(bobList.body).toHaveLength(0); // Bob sees none of Alice's
  });
});
