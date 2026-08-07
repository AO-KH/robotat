import "dotenv/config";
import { env } from "./lib/env"; // validates env and fails fast before anything starts
import { buildApp } from "./app";
import { serveStatic } from "./static";
import { log } from "./lib/log";
import { checkNotifyConfig } from "./lib/notify";
import { pool } from "./lib/db";
import { drainBackgroundWork } from "./lib/background";

(async () => {
  const { app, httpServer } = await buildApp();

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = env.PORT;
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      // reusePort is not supported on Windows
      ...(process.platform !== "win32" ? { reusePort: true } : {}),
    },
    () => {
      log(`serving on port ${port}`);
      // After the port line so it is the last thing in the boot output, where a
      // misconfiguration is hardest to scroll past.
      checkNotifyConfig();
    },
  );

  /*
    Docker sends SIGTERM and waits ten seconds before SIGKILL. Without this the process
    ignores it, every in-flight request is severed at the ten-second mark, and the Postgres
    pool is never drained — so each deploy leaves connections to time out server-side.

    Three things have to finish, in this order, and the order is the whole point:

      1. Close the HTTP server, so no new connection is accepted and open ones finish.
      2. Drain the work that was started *after* a response went out — a booking's
         WhatsApp and email delivery, a status-change notification. Closing the server
         knows nothing about these: its callback waits on sockets, and the delivery
         holds none, so it fires while the SMTP conversation is still open. Measured
         here, that callback landed three seconds in and a five-second delivery was cut
         off at exactly that point. See server/lib/background.ts.
      3. End the pool. Last, because step 2 reads device tokens out of it — ending it
         first is the same bug in a different place.

    One grace period covers all three. The drain gets whatever is left of it minus a
    reserve for the pool, rather than a fixed slice: the earlier steps normally take
    almost no time, so in practice delivery gets nearly the full window, and when they
    do drag the drain gives way instead of pushing the total past the budget.

    The exit timer is unref'd so it cannot itself hold the process open: it exists only to
    cap how long a wedged connection or a wedged delivery can delay the shutdown.
  */
  const SHUTDOWN_GRACE_MS = 8_000;
  const POOL_CLOSE_RESERVE_MS = 1_500;
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return; // SIGINT twice is a person losing patience, not a second shutdown
    shuttingDown = true;
    log(`${signal} received, shutting down`, "express");
    const deadline = Date.now() + SHUTDOWN_GRACE_MS;

    setTimeout(() => {
      log("grace period elapsed, exiting anyway", "express");
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();

    httpServer.close(async () => {
      const abandoned = await drainBackgroundWork(
        Math.max(0, deadline - Date.now() - POOL_CLOSE_RESERVE_MS),
      );
      // The one place this is ever visible: the call sites swallow their own errors, so
      // without this a severed booking notification leaves no trace at all.
      if (abandoned > 0) {
        log(`${abandoned} background task(s) abandoned at shutdown`, "express");
      }
      try {
        await pool.end();
      } catch (err) {
        log(`pool close failed: ${String(err)}`, "express");
      }
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  /*
    A rejected promise nobody caught leaves the process in an unknown state. Logging and
    exiting lets the orchestrator restart into a known one — silently continuing is the
    option that produces the bug report nobody can reproduce.
  */
  process.on("unhandledRejection", (reason) => {
    log(`unhandled rejection: ${String(reason)}`, "express");
    void shutdown("unhandledRejection");
  });

  /*
    Same reasoning as the rejection handler above, for the synchronous case: a throw
    outside any request — in a timer, an event handler, a stream — otherwise kills the
    process where it stands, with the pool still holding connections.

    Node's own warning about this hook is about *resuming* after one, which leaves the
    process in a state nobody can reason about. Shutting down is the sanctioned use, and
    it is the same shutdown every other path here takes.
  */
  process.on("uncaughtException", (err) => {
    log(`uncaught exception: ${String(err)}`, "express");
    void shutdown("uncaughtException");
  });
})();
