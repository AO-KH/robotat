import { Router } from "express";
import passport from "passport";
import { api } from "@shared/routes";
import type { User } from "@shared/schema";
import { handleZodError } from "../../lib/errors";
import { hashPassword, toPublicUser } from "./auth.service";
import { createUser, getUserByEmail } from "./auth.storage";

export const authRoutes = Router();

authRoutes.post(api.auth.register.path, async (req, res, next) => {
  try {
    const input = api.auth.register.input.parse(req.body);
    const existing = await getUserByEmail(input.email);
    if (existing) {
      return res.status(409).json({ message: "An account with that email already exists.", field: "email" });
    }
    const passwordHash = await hashPassword(input.password);
    const user = await createUser({ name: input.name, email: input.email, passwordHash });

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

authRoutes.post(api.auth.login.path, (req, res, next) => {
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

authRoutes.post(api.auth.logout.path, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.status(200).json({ ok: true });
  });
});

authRoutes.get(api.auth.me.path, (req, res) => {
  if (req.isAuthenticated?.() && req.user) {
    return res.status(200).json(toPublicUser(req.user as User));
  }
  res.status(401).json({ message: "Not signed in" });
});
