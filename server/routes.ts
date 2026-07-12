import type { Express } from "express";
import type { Server } from "http";
import { setupAuth } from "./modules/auth/auth.service";
import { authRoutes } from "./modules/auth/auth.routes";
import { assessmentRoutes } from "./modules/assessments/assessments.routes";
import { adminRoutes } from "./modules/admin/admin.routes";
import { contactRoutes } from "./modules/contact/contact.routes";
import { demoRequestRoutes } from "./modules/demo-requests/demo-requests.routes";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Sessions + passport must be wired before the route handlers.
  setupAuth(app);

  app.use(authRoutes);
  app.use(assessmentRoutes);
  app.use(adminRoutes);
  app.use(contactRoutes);
  app.use(demoRequestRoutes);

  return httpServer;
}
