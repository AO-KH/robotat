import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { Server } from "http";
import { getApp, resetDb, closeDb, newUser } from "./helpers";
import { pool } from "../server/lib/db";

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

/*
  These exist because the session table used to be created at runtime, by
  connect-pg-simple reading `table.sql` out of its own package directory. esbuild rewrites
  __dirname when it bundles the server, so the shipped build looked for /app/dist/table.sql
  and threw ENOENT on the first request that persisted a session — the first sign-in.

  Nothing caught it: this suite runs from source under tsx, where that read resolves, so
  every test could sign in happily while the built artifact could not. The table now comes
  from migration 0014 and the store is configured with createTableIfMissing: false, which
  is what makes the two environments agree.
*/
describe("session store", () => {
  it("has its table from the migrations, not from anything done at runtime", async () => {
    const { rows } = await pool.query<{ present: boolean }>(
      "SELECT to_regclass('public.user_sessions') IS NOT NULL AS present",
    );
    expect(rows[0].present).toBe(true);
  });

  it("carries the columns connect-pg-simple queries", async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'user_sessions'
       ORDER BY column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual(["expire", "sess", "sid"]);
  });

  it("actually persists a session — the thing the missing table broke", async () => {
    // saveUninitialized is false, so a row appears only once something is stored in the
    // session. Registration calls req.login(), which is that moment.
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/register").send(newUser());
    expect(res.status).toBe(201);

    const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM user_sessions");
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("keeps the caller signed in across requests using it", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(newUser());

    // A second request on the same agent carries only the cookie; if the store were not
    // working this would be a 401 rather than the account that just registered.
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(newUser().email);
  });
});
