import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { setupAuth, requireAuth, hashPassword, toPublicUser } from "./auth";
import { deliverAssessment, buildWhatsappLink, buildMailtoLink } from "./notify";
import type { User } from "@shared/schema";
import { z } from "zod";

function handleZodError(err: unknown, res: Response): boolean {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      message: err.errors[0].message,
      field: err.errors[0].path.join("."),
    });
    return true;
  }
  return false;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  setupAuth(app);

  /* ---------------- Auth ---------------- */

  app.post(api.auth.register.path, async (req, res, next) => {
    try {
      const input = api.auth.register.input.parse(req.body);
      const existing = await storage.getUserByEmail(input.email);
      if (existing) {
        return res.status(409).json({ message: "An account with that email already exists.", field: "email" });
      }
      const passwordHash = await hashPassword(input.password);
      const user = await storage.createUser({ name: input.name, email: input.email, passwordHash });

      // Log the new user straight in.
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(toPublicUser(user));
      });
    } catch (err) {
      if (handleZodError(err, res)) return;
      next(err);
    }
  });

  app.post(api.auth.login.path, (req, res, next) => {
    try {
      api.auth.login.input.parse(req.body);
    } catch (err) {
      if (handleZodError(err, res)) return;
      return next(err);
    }
    passport.authenticate("local", (err: unknown, user: User | false, info?: { message?: string }) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid email or password" });
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.status(200).json(toPublicUser(user));
      });
    })(req, res, next);
  });

  app.post(api.auth.logout.path, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.status(200).json({ ok: true });
    });
  });

  app.get(api.auth.me.path, (req: Request, res: Response) => {
    if (req.isAuthenticated?.() && req.user) {
      return res.status(200).json(toPublicUser(req.user as User));
    }
    res.status(401).json({ message: "Not signed in" });
  });

  /* ---------------- Assessments ---------------- */

  app.post(api.assessments.create.path, requireAuth, async (req, res, next) => {
    try {
      const input = api.assessments.create.input.parse(req.body);
      const user = req.user as User;
      const assessment = await storage.createAssessment({ userId: user.id, ...input });

      // Deliver to the business by email + WhatsApp (never blocks/fails the booking).
      deliverAssessment(assessment).catch(() => {});

      res.status(201).json({
        assessment,
        whatsappUrl: buildWhatsappLink(assessment),
        mailtoUrl: buildMailtoLink(assessment),
      });
    } catch (err) {
      if (handleZodError(err, res)) return;
      next(err);
    }
  });

  app.get(api.assessments.list.path, requireAuth, async (req, res, next) => {
    try {
      const user = req.user as User;
      const list = await storage.listAssessmentsByUser(user.id);
      res.status(200).json(list);
    } catch (err) {
      next(err);
    }
  });

  /* ---------------- Contact links (public; personalized if signed in) ---------------- */

  app.get(api.contact.get.path, (req, res) => {
    const u = (req.user as User) || undefined;
    const lead = { name: u?.name, email: u?.email };
    res.status(200).json({
      whatsappUrl: buildWhatsappLink(lead),
      mailtoUrl: buildMailtoLink(lead),
    });
  });

  // Build contact links from a submitted form (no account required, no record saved).
  app.post(api.contact.submit.path, (req, res, next) => {
    try {
      const input = api.contact.submit.input.parse(req.body);
      res.status(200).json({
        whatsappUrl: buildWhatsappLink(input),
        mailtoUrl: buildMailtoLink(input),
      });
    } catch (err) {
      if (handleZodError(err, res)) return;
      next(err);
    }
  });

  /* ---------------- Legacy public demo request ---------------- */

  app.post(api.demoRequests.create.path, async (req, res, next) => {
    try {
      const input = api.demoRequests.create.input.parse(req.body);
      const request = await storage.createDemoRequest(input);
      res.status(201).json(request);
    } catch (err) {
      if (handleZodError(err, res)) return;
      next(err);
    }
  });

  return httpServer;
}
