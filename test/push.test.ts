import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { Server } from "http";
import { getApp, resetDb, closeDb, newUser } from "./helpers";
import { pool } from "../server/lib/db";

/**
 * Device-token registration for native push.
 *
 * The API only ever answers `{ ok: true }`, so nearly every assertion here reads the
 * push_tokens rows directly: the point of this endpoint is what it leaves in the table.
 */

let app: Server;

beforeAll(async () => {
  app = await getApp();
});
beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});

async function tokenRows() {
  const { rows } = await pool.query("SELECT * FROM push_tokens ORDER BY id");
  return rows;
}

/** Register a fresh user and return an authenticated agent plus their id. */
async function signUp(email: string) {
  const agent = request.agent(app);
  const creds = newUser({ email });
  const res = await agent.post("/api/auth/register").send(creds);
  expect(res.status).toBe(201);
  return { agent, creds, userId: res.body.id as number };
}

const DEVICE = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

describe("push token registration (POST /api/push/register)", () => {
  it("requires a signed-in user", async () => {
    const res = await request(app).post("/api/push/register").send({ token: DEVICE });
    expect(res.status).toBe(401);
    expect(await tokenRows()).toHaveLength(0);
  });

  it("rejects an empty token with 400", async () => {
    const { agent } = await signUp("a@example.com");
    expect((await agent.post("/api/push/register").send({ token: "" })).status).toBe(400);
    expect((await agent.post("/api/push/register").send({})).status).toBe(400);
    expect(await tokenRows()).toHaveLength(0);
  });

  it("stores the device against the signed-in user, defaulting to iOS", async () => {
    const { agent, userId } = await signUp("a@example.com");

    const res = await agent.post("/api/push/register").send({ token: DEVICE });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const rows = await tokenRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe(DEVICE);
    expect(rows[0].user_id).toBe(userId);
    expect(rows[0].platform).toBe("ios");
    expect(rows[0].last_seen_at).not.toBeNull();
  });

  it("is idempotent — re-registering the same device updates the row instead of adding one", async () => {
    const { agent } = await signUp("a@example.com");
    expect((await agent.post("/api/push/register").send({ token: DEVICE })).status).toBe(200);

    const [before] = await tokenRows();
    // Backdate rather than sleep: this asserts last_seen_at is actually rewritten,
    // without depending on the clock ticking between two sub-millisecond requests.
    await pool.query("UPDATE push_tokens SET last_seen_at = now() - interval '1 day'");
    const [backdated] = await tokenRows();

    // The app re-registers on every launch — that must not accumulate rows.
    expect((await agent.post("/api/push/register").send({ token: DEVICE })).status).toBe(200);

    const rows = await tokenRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(before.id); // same row, updated
    expect(rows[0].created_at).toEqual(before.created_at); // not re-created
    expect(rows[0].last_seen_at.getTime()).toBeGreaterThan(backdated.last_seen_at.getTime());
  });

  it("reassigns a device when a different account registers the same token", async () => {
    const { agent: first, userId: firstId } = await signUp("first@example.com");
    expect((await first.post("/api/push/register").send({ token: DEVICE })).status).toBe(200);

    // The same phone, handed over and signed into with another account. The token is
    // a property of the device, so it has to move — not exist twice, or the previous
    // owner would keep receiving this device's notifications.
    const { agent: second, userId: secondId } = await signUp("second@example.com");
    expect((await second.post("/api/push/register").send({ token: DEVICE })).status).toBe(200);

    const rows = await tokenRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(secondId);
    expect(rows[0].user_id).not.toBe(firstId);
  });

  it("keeps one row per device when a user has several devices", async () => {
    const { agent, userId } = await signUp("a@example.com");
    await agent.post("/api/push/register").send({ token: `${DEVICE}-iphone` });
    await agent.post("/api/push/register").send({ token: `${DEVICE}-ipad` });

    const rows = await tokenRows();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.user_id === userId)).toBe(true);
  });

  it("works over a bearer token (the native app has no session cookie)", async () => {
    const creds = newUser();
    await request(app).post("/api/auth/register").send(creds);
    const issued = await request(app)
      .post("/api/auth/token")
      .send({ email: creds.email, password: creds.password });

    const res = await request(app)
      .post("/api/push/register")
      .set("Authorization", `Bearer ${issued.body.token}`)
      .send({ token: DEVICE });
    expect(res.status).toBe(200);
    expect(await tokenRows()).toHaveLength(1);
  });
});

describe("push token removal (POST /api/push/unregister)", () => {
  it("requires a signed-in user", async () => {
    const res = await request(app).post("/api/push/unregister").send({ token: DEVICE });
    expect(res.status).toBe(401);
  });

  it("forgets the caller's device", async () => {
    const { agent } = await signUp("a@example.com");
    await agent.post("/api/push/register").send({ token: DEVICE });

    const res = await agent.post("/api/push/unregister").send({ token: DEVICE });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(await tokenRows()).toHaveLength(0);
  });

  it("leaves other users' devices alone, and unregistering one is a silent no-op", async () => {
    const { agent: owner, userId: ownerId } = await signUp("owner@example.com");
    await owner.post("/api/push/register").send({ token: DEVICE });

    // Note there is no "same token owned by two users" case to test: `token` is UNIQUE,
    // which is precisely what makes registration reassign rather than duplicate. So the
    // real hazard is a stranger unregistering a token they merely know the value of.
    const { agent: stranger } = await signUp("stranger@example.com");
    const res = await stranger.post("/api/push/unregister").send({ token: DEVICE });

    // 200, not 404: the delete is owner-scoped so nothing happened, and a distinct
    // status would tell the caller whether the token exists on another account.
    expect(res.status).toBe(200);
    const rows = await tokenRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(ownerId);
  });

  it("is a no-op for a token that was never registered", async () => {
    const { agent } = await signUp("a@example.com");
    const res = await agent.post("/api/push/unregister").send({ token: "never-seen" });
    expect(res.status).toBe(200);
    expect(await tokenRows()).toHaveLength(0);
  });
});

describe("push tokens and sign-out", () => {
  it("releases the caller's devices when they log out", async () => {
    const { agent } = await signUp("leaver@example.com");
    await agent.post("/api/push/register").send({ token: DEVICE });
    await agent.post("/api/push/register").send({ token: `${DEVICE}-ipad` });
    expect(await tokenRows()).toHaveLength(2);

    // The app releases its own token first, but that request can simply not arrive —
    // sign out with no connectivity and the row survives, still naming this user, so
    // the next status change pushes their site address to whoever holds the phone next.
    // This is the sweep that does not depend on the client reaching us.
    expect((await agent.post("/api/auth/logout").send({})).status).toBe(200);

    expect(await tokenRows()).toHaveLength(0);
  });

  it("leaves other accounts' devices alone", async () => {
    const { agent: stayer, userId: stayerId } = await signUp("stayer@example.com");
    await stayer.post("/api/push/register").send({ token: `${DEVICE}-other` });

    const { agent: leaver } = await signUp("leaver@example.com");
    await leaver.post("/api/push/register").send({ token: DEVICE });

    expect((await leaver.post("/api/auth/logout").send({})).status).toBe(200);

    const rows = await tokenRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(stayerId);
  });

  it("still signs a caller out when they never registered a device", async () => {
    const { agent } = await signUp("a@example.com");
    expect((await agent.post("/api/auth/logout").send({})).status).toBe(200);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("sweeps for a bearer-token caller too (the native app has no session cookie)", async () => {
    const creds = newUser();
    await request(app).post("/api/auth/register").send(creds);
    const issued = await request(app)
      .post("/api/auth/token")
      .send({ email: creds.email, password: creds.password });
    const bearer = `Bearer ${issued.body.token}`;

    await request(app).post("/api/push/register").set("Authorization", bearer).send({ token: DEVICE });
    expect(await tokenRows()).toHaveLength(1);

    expect((await request(app).post("/api/auth/logout").set("Authorization", bearer).send({})).status).toBe(200);
    expect(await tokenRows()).toHaveLength(0);
  });
});

describe("push tokens and account deletion", () => {
  it("cascades a deleted account's devices away", async () => {
    const { agent, creds } = await signUp("leaver@example.com");
    await agent.post("/api/push/register").send({ token: DEVICE });

    const { agent: other } = await signUp("stayer@example.com");
    await other.post("/api/push/register").send({ token: `${DEVICE}-other` });
    expect(await tokenRows()).toHaveLength(2);

    // Account deletion anonymises bookings and detaches analytics, but says nothing
    // about push tokens — the foreign key's ON DELETE CASCADE is the only thing
    // stopping a deleted user's device from outliving them.
    expect((await agent.delete("/api/auth/account").send({ password: creds.password })).status).toBe(200);

    const rows = await tokenRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe(`${DEVICE}-other`);
  });
});
