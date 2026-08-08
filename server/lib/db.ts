import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { env } from "./env";
import { log } from "./log";

const { Pool } = pg;

export const pool = new Pool({ connectionString: env.DATABASE_URL });

/*
  An idle connection dying is routine, and it must not take the server with it.

  Postgres closes idle backends when it restarts, when a managed provider recycles them,
  and whenever a firewall or NAT quietly drops a long-lived socket. node-postgres reports
  that as an `error` event on the pool, and an `error` event with no listener is rethrown
  by EventEmitter — which used to kill the process outright. Since graceful shutdown
  landed it is worse, not better: the throw reaches the `uncaughtException` hook in
  server/index.ts, so a blip the pool was designed to absorb now spends up to eight
  seconds politely dismantling a healthy server and hands the orchestrator a restart.

  There is nothing to recover here, only something not to escalate: the client has already
  been removed from the pool by the time this fires, and the next checkout dials a new one.

  Active queries are unaffected. pg detaches this listener from a client for as long as it
  is checked out and reattaches it on release, so a connection that dies mid-query rejects
  that query's promise and propagates to the caller — this path only ever sees clients that
  were sitting idle with no work to lose.
*/
pool.on("error", (err) => {
  log(`idle client error, connection discarded: ${String(err)}`, "db");
});

export const db = drizzle(pool, { schema });
