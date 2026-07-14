import type { Request } from "express";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import passport from "passport";
import { api } from "@shared/routes";
import type { User } from "@shared/schema";
import { handleZodError } from "../../lib/errors";
import {
  requireAuth,
  hashPassword,
  verifyPassword,
  toPublicUser,
  issueToken,
  generateToken,
  hashToken,
  PASSWORD_RESET_TTL_MS,
  EMAIL_VERIFY_TTL_MS,
} from "./auth.service";
import {
  createUser,
  getUserByEmail,
  getUserById,
  updateUserName,
  updateUserPassword,
  markEmailVerified,
  createAuthToken,
  getValidAuthToken,
  markAuthTokenUsed,
  invalidateUserTokens,
} from "./auth.storage";
import {
  passwordResetMessage,
  emailVerificationMessage,
  sendUserEmail,
} from "../../lib/notify";
import { log } from "../../lib/log";

// Outside production we return the raw token in the JSON response so integration
// tests (and local manual testing) can complete the flow without a real inbox.
const EXPOSE_DEV_TOKEN = process.env.NODE_ENV !== "production";

/** Absolute app origin for building emailed links (proxy-aware; env override wins). */
function appOrigin(req: Request): string {
  return process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`;
}

/** Mint + store a verification token for a user and email them the link. Best-effort. */
async function sendEmailVerification(req: Request, user: User): Promise<string> {
  await invalidateUserTokens(user.id, "email_verification");
  const { token, tokenHash } = generateToken();
  await createAuthToken({
    userId: user.id,
    kind: "email_verification",
    tokenHash,
    expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
  });
  const link = `${appOrigin(req)}/verify-email?token=${token}`;
  const { subject, body } = emailVerificationMessage(user.name, link);
  await sendUserEmail(user.email, subject, body);
  return token;
}

export const authRoutes = Router();

// Throttle credential endpoints per IP to blunt brute-force / credential stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in a few minutes." },
  // Don't throttle the integration tests (many login/register calls per IP).
  skip: () => process.env.NODE_ENV === "test",
});

authRoutes.post(api.auth.register.path, authLimiter, async (req, res, next) => {
  try {
    const input = api.auth.register.input.parse(req.body);
    const existing = await getUserByEmail(input.email);
    if (existing) {
      return res.status(409).json({ message: "An account with that email already exists.", field: "email" });
    }
    const passwordHash = await hashPassword(input.password);
    const user = await createUser({ name: input.name, email: input.email, passwordHash });

    // Fire off the verification email (best-effort — never block/fault signup).
    sendEmailVerification(req, user).catch((err) =>
      log(`verification email failed for ${user.email}: ${String(err)}`, "auth"),
    );

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

authRoutes.post(api.auth.login.path, authLimiter, (req, res, next) => {
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

// POST /api/auth/token — exchange credentials for a bearer token (no session cookie).
authRoutes.post(api.auth.token.path, authLimiter, async (req, res, next) => {
  try {
    const input = api.auth.token.input.parse(req.body);
    const user = await getUserByEmail(input.email);
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    res.status(200).json({ token: issueToken(user.id), user: toPublicUser(user) });
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
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

// PATCH /api/auth/profile — update the signed-in user's name.
authRoutes.patch(api.auth.updateProfile.path, requireAuth, async (req, res, next) => {
  try {
    const input = api.auth.updateProfile.input.parse(req.body);
    const user = req.user as User;
    const updated = await updateUserName(user.id, input.name);
    res.status(200).json(toPublicUser(updated));
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});

// PATCH /api/auth/password — change password (requires the current password).
authRoutes.patch(api.auth.changePassword.path, requireAuth, async (req, res, next) => {
  try {
    const input = api.auth.changePassword.input.parse(req.body);
    const user = req.user as User;
    // Re-load to get the current hash (the session user may be stale).
    const fresh = await getUserById(user.id);
    if (!fresh) return res.status(401).json({ message: "Not signed in" });

    const ok = await verifyPassword(input.currentPassword, fresh.passwordHash);
    if (!ok) {
      return res.status(400).json({ message: "Current password is incorrect.", field: "currentPassword" });
    }
    await updateUserPassword(user.id, await hashPassword(input.newPassword));
    res.status(200).json({ ok: true });
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});

// POST /api/auth/forgot-password — email a reset link. Always 200 (no user enumeration).
authRoutes.post(api.auth.forgotPassword.path, authLimiter, async (req, res, next) => {
  try {
    const input = api.auth.forgotPassword.input.parse(req.body);
    const user = await getUserByEmail(input.email);

    let devToken: string | undefined;
    if (user) {
      await invalidateUserTokens(user.id, "password_reset");
      const { token, tokenHash } = generateToken();
      await createAuthToken({
        userId: user.id,
        kind: "password_reset",
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      });
      const link = `${appOrigin(req)}/reset-password?token=${token}`;
      const { subject, body } = passwordResetMessage(user.name, link);
      await sendUserEmail(user.email, subject, body);
      devToken = token;
    }

    res.status(200).json({ ok: true, ...(EXPOSE_DEV_TOKEN && devToken ? { devToken } : {}) });
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});

// POST /api/auth/reset-password — redeem a reset token and set a new password.
authRoutes.post(api.auth.resetPassword.path, authLimiter, async (req, res, next) => {
  try {
    const input = api.auth.resetPassword.input.parse(req.body);
    const token = await getValidAuthToken("password_reset", hashToken(input.token));
    if (!token) {
      return res.status(400).json({ message: "This reset link is invalid or has expired.", field: "token" });
    }

    await updateUserPassword(token.userId, await hashPassword(input.newPassword));
    await markAuthTokenUsed(token.id);
    // A successful reset proves control of the inbox → treat the email as verified.
    await markEmailVerified(token.userId);
    // Drop any other outstanding reset links.
    await invalidateUserTokens(token.userId, "password_reset");

    res.status(200).json({ ok: true });
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});

// POST /api/auth/verify-email — redeem a verification token. Returns the updated user.
authRoutes.post(api.auth.verifyEmail.path, async (req, res, next) => {
  try {
    const input = api.auth.verifyEmail.input.parse(req.body);
    const token = await getValidAuthToken("email_verification", hashToken(input.token));
    if (!token) {
      return res.status(400).json({ message: "This verification link is invalid or has expired.", field: "token" });
    }

    const user = await markEmailVerified(token.userId);
    await markAuthTokenUsed(token.id);
    res.status(200).json(toPublicUser(user));
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});

// POST /api/auth/resend-verification — re-send the verification email (signed-in users).
authRoutes.post(api.auth.resendVerification.path, requireAuth, authLimiter, async (req, res, next) => {
  try {
    const sessionUser = req.user as User;
    const user = await getUserById(sessionUser.id);
    if (!user) return res.status(401).json({ message: "Not signed in" });
    if (user.emailVerifiedAt) {
      return res.status(200).json({ ok: true, alreadyVerified: true });
    }
    const token = await sendEmailVerification(req, user);
    res.status(200).json({ ok: true, ...(EXPOSE_DEV_TOKEN ? { devToken: token } : {}) });
  } catch (err) {
    next(err);
  }
});
