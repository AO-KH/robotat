import "dotenv/config";
import { env } from "./lib/env"; // validates env and fails fast before anything starts
import { buildApp } from "./app";
import { serveStatic } from "./static";
import { log } from "./lib/log";
import { checkNotifyConfig } from "./lib/notify";
import { pool } from "./lib/db";

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

    Closing the HTTP server stops new connections and lets open ones finish; the pool goes
    after, because a request still completing needs it.

    The exit timer is unref'd so it cannot itself hold the process open: it exists only to
    cap how long a wedged connection can delay the shutdown.
  */
  const SHUTDOWN_GRACE_MS = 8_000;
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return; // SIGINT twice is a person losing patience, not a second shutdown
    shuttingDown = true;
    log(`${signal} received, shutting down`, "express");

    setTimeout(() => {
      log("grace period elapsed, exiting anyway", "express");
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();

    httpServer.close(async () => {
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
