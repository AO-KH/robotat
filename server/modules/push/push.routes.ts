import { Router } from "express";
import { api } from "@shared/routes";
import type { User } from "@shared/schema";
import { handleZodError } from "../../lib/errors";
import { requireAuth } from "../auth/auth.service";
import { upsertPushToken, deletePushToken } from "./push.storage";

export const pushRoutes = Router();

/**
 * Device-token registration for native push.
 *
 * No extra rate limiter: both endpoints require a session or bearer token and are
 * idempotent, so hammering them costs one upsert and changes nothing.
 */

// POST /api/push/register — called on every app launch once permission is granted.
pushRoutes.post(api.push.register.path, requireAuth, async (req, res, next) => {
  try {
    const input = api.push.register.input.parse(req.body);
    const user = req.user as User;
    await upsertPushToken({ userId: user.id, token: input.token, platform: input.platform });
    res.status(200).json({ ok: true });
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});

// POST /api/push/unregister — notifications turned off, or signing out on this device.
// Always 200: unregistering something you don't hold is a no-op, and a 404 would tell
// the caller whether a token exists on another account.
pushRoutes.post(api.push.unregister.path, requireAuth, async (req, res, next) => {
  try {
    const input = api.push.unregister.input.parse(req.body);
    const user = req.user as User;
    await deletePushToken(user.id, input.token);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});
