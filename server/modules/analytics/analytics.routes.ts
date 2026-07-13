import { Router } from "express";
import rateLimit from "express-rate-limit";
import { api } from "@shared/routes";
import type { User } from "@shared/schema";
import { handleZodError } from "../../lib/errors";
import { requireStaff } from "../auth/auth.service";
import { recordEvent, getSummary } from "./analytics.storage";

export const analyticsRoutes = Router();

// Generous per-IP cap: a page load fires a few events; this only blunts abuse.
const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

// POST /api/analytics/events — public, fire-and-forget.
analyticsRoutes.post(api.analytics.track.path, ingestLimiter, async (req, res, next) => {
  try {
    const input = api.analytics.track.input.parse(req.body);
    const userId = req.isAuthenticated?.() && req.user ? (req.user as User).id : null;
    await recordEvent({ ...input, userId });
    res.status(202).json({ ok: true });
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});

// GET /api/admin/analytics — staff-only aggregate summary.
analyticsRoutes.get(api.admin.analytics.path, requireStaff, async (_req, res, next) => {
  try {
    res.status(200).json(await getSummary());
  } catch (err) {
    next(err);
  }
});
