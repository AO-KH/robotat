import type { Express } from "express";
import type { Server } from "http";
import { pool } from "./lib/db";
import { log } from "./lib/log";
import { setupAuth } from "./modules/auth/auth.service";
import { authRoutes } from "./modules/auth/auth.routes";
import { assessmentRoutes } from "./modules/assessments/assessments.routes";
import { adminRoutes } from "./modules/admin/admin.routes";
import { analyticsRoutes } from "./modules/analytics/analytics.routes";
import { productRoutes } from "./modules/products/products.routes";
import { contactRoutes } from "./modules/contact/contact.routes";
import { pushRoutes } from "./modules/push/push.routes";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Liveness probe for containers / load balancers (no auth, no DB).
  app.get("/api/health", (_req, res) => res.status(200).json({ ok: true }));

  /*
    Readiness, as distinct from liveness above.

    /api/health answers "is this process running", which is the right question for a
    restart policy and deliberately touches nothing. This one answers "can it serve a
    request", which needs the database — and that is the question a load balancer should
    be asking before it sends traffic. Conflating them meant a container with an
    unreachable Postgres reported healthy and kept taking requests it could only fail.

    503 rather than 500: the process is fine, it just cannot serve yet.
  */
  app.get("/api/ready", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.status(200).json({ ok: true, database: "up" });
    } catch (err) {
      log(`readiness check failed: ${String(err)}`, "health");
      res.status(503).json({ ok: false, database: "down" });
    }
  });

  // Sessions + passport must be wired before the route handlers.
  setupAuth(app);

  app.use(authRoutes);
  app.use(assessmentRoutes);
  app.use(adminRoutes);
  app.use(analyticsRoutes);
  app.use(productRoutes);
  app.use(contactRoutes);
  app.use(pushRoutes);

  return httpServer;
}
