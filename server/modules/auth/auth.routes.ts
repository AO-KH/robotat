import { timingSafeEqual } from "crypto";
import type { Request } from "express";
import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import passport from "passport";
import { api } from "@shared/routes";
import type { User } from "@shared/schema";
import { handleZodError, pgErrorCode, PG_UNIQUE_VIOLATION } from "../../lib/errors";
import { env } from "../../lib/env";
import {
  requireAuth,
  hashPassword,
  verifyPassword,
  verifyCredentials,
  upgradePasswordHash,
  toPublicUser,
  issueToken,
  canonicalEmail,
  generateToken,
  generateVerificationCode,
  MAX_VERIFY_ATTEMPTS,
  hashToken,
  PASSWORD_RESET_TTL_MS,
  EMAIL_VERIFY_TTL_MS,
} from "./auth.service";
import {
  createUser,
  getUserByEmail,
  getUserByCanonicalEmail,
  getUserById,
  updateUserName,
  updateUserPassword,
  revokeUserCredentials,
  deleteAccountAndAnonymise,
  markEmailVerified,
  createAuthToken,
  getValidAuthToken,
  getLiveVerificationToken,
  replaceVerificationToken,
  spendVerificationAttempt,
  markAuthTokenUsed,
  invalidateUserTokens,
} from "./auth.storage";
import {
  passwordResetMessage,
  emailVerificationMessage,
  sendUserEmail,
} from "../../lib/notify";
import { deleteTokensForUser } from "../push/push.storage";
import { log } from "../../lib/log";

// Outside production we return the raw token in the JSON response so integration
// tests (and local manual testing) can complete the flow without a real inbox.
const EXPOSE_DEV_TOKEN = process.env.NODE_ENV !== "production";

/**
 * Said the same way whether the duplicate is caught by the lookup or by the index.
 *
 * Names the remedy rather than only the problem: someone typing an alias of an address
 * they already registered has no reason to connect "already exists" with the dots they
 * added, so the message asks for a different address outright.
 */
const DUPLICATE_EMAIL_MESSAGE =
  "An account already uses this email address. Please sign in instead, or register with a different email.";

/**
 * Absolute app origin for building emailed links.
 *
 * `PUBLIC_APP_URL` is REQUIRED in production (enforced at boot by lib/env.ts), so the
 * request-derived fallback below is only ever reachable in development and test. That
 * matters: `req.get("host")` is attacker-controlled, so without the boot guard anyone
 * could send `Host: attacker.example` to /forgot-password and have a genuine reset
 * token emailed to the victim pointing at their own domain.
 */
function appOrigin(req: Request): string {
  return env.PUBLIC_APP_URL ?? `${req.protocol}://${req.get("host")}`;
}

/**
 * Mint a 6-digit verification code, store only its hash, and email the code itself.
 *
 * Retiring the old code and storing the new one is one atomic step (see
 * replaceVerificationToken) rather than two calls. Done separately, a double-tapped
 * "resend" left several live codes for one account, which both multiplies the guesses a
 * 6-digit space allows and hands the customer a code the reader might not pick. The raw
 * code is returned rather than kept, because only the caller (the dev-token path) has any
 * use for it; the database never sees it.
 *
 * Best-effort at the call sites: registration must not fail because SMTP is down, since
 * the customer can always ask for another code.
 */
async function sendEmailVerification(user: User): Promise<string> {
  const { code, tokenHash } = generateVerificationCode();
  await replaceVerificationToken({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
  });
  const { subject, body } = emailVerificationMessage(user.name, code, user.locale);
  await sendUserEmail(user.email, subject, body);
  return code;
}

export const authRoutes = Router();

const LIMIT_WINDOW_MS = 15 * 60 * 1000;

/*
  One bucket per thing being defended, rather than one bucket for "auth".

  These used to share a single 10-per-15-minutes IP allowance across register, login,
  /token, both password-reset endpoints and resend-verification. Two consequences, and
  neither is the brute-force the limiter was for:

    - a customer who mistypes their password a few times can no longer request a reset,
      because both spend the same budget; and
    - anyone can lock an entire NAT'd office out of password recovery by spending that
      budget on /register calls, which need no credentials at all.

  Splitting them costs nothing and removes both. The reasoning is the one already written
  for verifyEmailLimiter below, applied to the endpoints it was not applied to.
*/
const limiterBase = {
  windowMs: LIMIT_WINDOW_MS,
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  // Don't throttle the integration tests (many login/register calls per IP).
  skip: () => process.env.NODE_ENV === "test",
};

/** Sign-in attempts from one address. Brute force from a single source. */
const credentialsLimiter = rateLimit({
  ...limiterBase,
  limit: 20,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});

/*
  Sign-in attempts against one ACCOUNT, whatever address they come from.

  The per-IP limiter above does not bound this at all: credential stuffing is distributed
  by definition, and against a proxy pool "20 per IP" is not a ceiling on anything. What
  is actually under attack is one account, so that is what the budget belongs to — the
  same argument verifyEmailLimiter makes for codes.

  Keyed on the canonical address rather than the literal one, so `a.b@gmail.com` and
  `ab@gmail.com` cannot be used to buy two budgets against one mailbox.

  `skipSuccessfulRequests` is what makes this safe to key on an attacker-supplied value.
  Only failures count, so no amount of correct signing-in consumes the allowance, and a
  real customer cannot reach it. The residual is honest and bounded: someone who knows
  your address can spend twenty failures and keep you out for the rest of the window.
  That is a worse trade than doing nothing only if unlimited offline-speed guessing
  against your account is the safer of the two, and it is not.
*/
const accountCredentialsLimiter = rateLimit({
  ...limiterBase,
  limit: 20,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return typeof email === "string" && email.trim() !== ""
      ? `account:${canonicalEmail(email)}`
      : ipKeyGenerator(req.ip ?? "");
  },
  message: { message: "Too many attempts for this account. Please try again in a few minutes." },
});

/** Account creation. Its own bucket so spending it cannot affect anyone signing in. */
const registerLimiter = rateLimit({
  ...limiterBase,
  limit: 10,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});

/*
  Password reset and verification resends — every endpoint that puts mail in someone's
  inbox on an unauthenticated or barely-authenticated request.

  Together rather than separately, because the thing being rationed is outbound mail over
  ROBOTAT's sending reputation, and it does not matter which of the three produced it.
*/
const recoveryLimiter = rateLimit({
  ...limiterBase,
  limit: 10,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});

/*
  Re-authentication on an account someone is already signed in to: changing a password,
  deleting the account.

  Both re-check the current password, so both run scrypt on attacker-supplied input, and
  neither had any limiter at all. Keyed on the account because requireAuth has already
  established which one it is, and the threat these re-checks exist for — someone who
  walked up to an unlocked device — is sitting on the legitimate user's IP.
*/
const reauthLimiter = rateLimit({
  ...limiterBase,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const user = req.user as User | undefined;
    return user ? `reauth:${user.id}` : ipKeyGenerator(req.ip ?? "");
  },
  message: { message: "Too many attempts. Please try again in a few minutes." },
});

/*
  Its own bucket, and the one this file's split above was modelled on.

  Verification was given a separate allowance first, for the reason that now applies
  everywhere: a customer who mistypes their code a few times must not thereby lose the
  ability to sign in, and an attacker who wants someone locked out of password reset must
  not be able to buy that by spending a shared budget on a different endpoint.

  Keyed on the account rather than the IP: a code is only ever checked against the
  signed-in user's own token (see the route note below), so the thing being attacked is
  one account, and an attacker rotating IPs against it should gain nothing. It also spares
  everyone behind one office NAT from each other's typos. requireAuth runs first, so
  req.user is always set; the IP fallback exists only so a future reordering degrades to
  the house behaviour instead of putting the whole internet in one bucket.

  Twenty is four full code lifetimes in the window — a real customer never gets near it,
  since a code dies after five wrong guesses and asking for a new one costs a resend from
  recoveryLimiter's allowance.
*/
const verifyEmailLimiter = rateLimit({
  ...limiterBase,
  limit: 20,
  keyGenerator: (req) => {
    const user = req.user as User | undefined;
    return user ? `user:${user.id}` : ipKeyGenerator(req.ip ?? "");
  },
  message: { message: "Too many incorrect codes. Please try again in a few minutes." },
});

authRoutes.post(api.auth.register.path, registerLimiter, async (req, res, next) => {
  try {
    const input = api.auth.register.input.parse(req.body);

    /*
      Matched on the canonical form, not the literal address, so one mailbox cannot hold
      several accounts. Gmail ignores dots and anything after a `+`, and a plain
      uniqueness check let abdullahkh250@, abdullah.kh250@ and abdullahkh250+farm@ all
      register — three accounts, one inbox, three verification codes that all arrive, and
      three separate allowances under a booking limit meant to be per person.

      The 409 is a courtesy, not the guarantee: check-then-insert is a race, and the
      unique index on email_canonical (migration 0011) is what actually holds. The catch
      below turns that constraint into the same answer rather than a 500.
    */
    const existing = await getUserByCanonicalEmail(canonicalEmail(input.email));
    if (existing) {
      return res.status(409).json({ message: DUPLICATE_EMAIL_MESSAGE, field: "email" });
    }
    const passwordHash = await hashPassword(input.password);
    const user = await createUser({ name: input.name, email: input.email, passwordHash, locale: input.locale });

    // Fire off the verification email (best-effort — never block/fault signup).
    sendEmailVerification(user).catch((err) =>
      log(`verification email failed for ${user.email}: ${String(err)}`, "auth"),
    );

    // Log the new user straight in.
    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json(toPublicUser(user));
    });
  } catch (err) {
    if (handleZodError(err, res)) return;
    /*
      Two people registering the same mailbox in the same instant both pass the check
      above and one loses at the index. Postgres 23505 is unique_violation; without this
      the loser gets a 500 for what is really the ordinary "already taken" answer.

      Read through pgErrorCode rather than off `err` directly: Drizzle rethrows every
      failed query as a DrizzleQueryError that carries the driver error on `.cause` and
      copies no properties off it, so `err.code` is undefined for every database error
      this app can raise. See the note on pgErrorCode.
    */
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
      return res.status(409).json({ message: DUPLICATE_EMAIL_MESSAGE, field: "email" });
    }
    next(err);
  }
});

authRoutes.post(api.auth.login.path, credentialsLimiter, accountCredentialsLimiter, (req, res, next) => {
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
authRoutes.post(api.auth.token.path, credentialsLimiter, accountCredentialsLimiter, async (req, res, next) => {
  try {
    const input = api.auth.token.input.parse(req.body);
    const user = await getUserByEmail(input.email);
    // verifyCredentials, not verifyPassword: `!user ||` would short-circuit past scrypt
    // and time the answer for an attacker. See the note on it in auth.service.ts.
    const ok = await verifyCredentials(input.password, user);
    if (!ok || !user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    // Same upgrade the session path does — the native client must not be the reason an
    // account is left on old hashing parameters forever.
    await upgradePasswordHash(user, input.password);
    res.status(200).json({ token: issueToken(user.id, user.tokenVersion), user: toPublicUser(user) });
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});

authRoutes.post(api.auth.logout.path, async (req, res, next) => {
  /*
    Drop this account's push tokens BEFORE the session goes away — after `req.logout()`
    there is no `req.user` left to scope the delete to.

    The app already releases its own token via POST /api/push/unregister on the way here,
    but that call can simply not arrive: sign out on a train and the row survives, still
    naming this user, and the next status change delivers their site address and notes to
    whoever is holding the phone. Connectivity is not in question on this side of the
    wire, so this is the sweep that actually closes it.

    Best-effort, like every other notification concern: a database hiccup must not leave
    someone unable to sign out.
  */
  const user = req.user as User | undefined;
  if (user) {
    try {
      await deleteTokensForUser(user.id);
    } catch (err) {
      log(`push token cleanup failed for user ${user.id}: ${String(err)}`, "auth");
    }
  }

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
authRoutes.patch(api.auth.changePassword.path, requireAuth, reauthLimiter, async (req, res, next) => {
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
    // Changing a password must evict anyone else holding a credential for this
    // account — bearer tokens and sessions on other devices. Keep the caller's own
    // session so they aren't signed out of the tab they just used.
    await revokeUserCredentials(user.id, req.sessionID);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});

// DELETE /api/auth/account — delete the signed-in user's account. Irreversible.
// Required in-app by App Store Guideline 5.1.1(v).
authRoutes.delete(api.auth.deleteAccount.path, requireAuth, reauthLimiter, async (req, res, next) => {
  try {
    const input = api.auth.deleteAccount.input.parse(req.body);
    const user = req.user as User;
    // Re-load to get the current hash (the session user may be stale).
    const fresh = await getUserById(user.id);
    if (!fresh) return res.status(401).json({ message: "Not signed in" });

    // Being signed in isn't proof enough for something irreversible: anyone who
    // walks up to an unlocked device inherits the session.
    const ok = await verifyPassword(input.password, fresh.passwordHash);
    if (!ok) return res.status(401).json({ message: "That password is incorrect." });

    await deleteAccountAndAnonymise(fresh.id);

    // Same teardown as logout, plus the session row and cookie: the user row is gone,
    // so nothing would authenticate anyway, but leaving a cookie behind means the app
    // keeps asking about an account that no longer exists.
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        // "connect.sid" is the express-session default; setupAuth doesn't set `name`.
        res.clearCookie("connect.sid");
        res.status(200).json({ ok: true });
      });
    });
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});

// POST /api/auth/forgot-password — email a reset link. Always 200 (no user enumeration).
authRoutes.post(api.auth.forgotPassword.path, recoveryLimiter, async (req, res, next) => {
  try {
    const input = api.auth.forgotPassword.input.parse(req.body);

    /*
      Resolved by canonical form, unlike sign-in — because this is the only way back for
      someone whose address was squatted.

      Registration rejects any address whose canonical form is taken, so one unauthenticated
      request registering a.bdullah@gmail.com occupies the whole alias family of
      abdullah@gmail.com. The real owner of that mailbox is then shut out of every door:
      registration 409s forever, sign-in matches the literal column so their address simply
      does not exist, and matching literally here returned the same silent 200 as a typo,
      with no mail. Nothing expires an account that was never verified.

      Widening this cannot hand the wrong account to anyone. `canonicalEmail` only folds
      forms the provider documents as one mailbox, so a match means the two addresses
      deliver to the same place; `email_canonical` is uniquely indexed (migration 0011), so
      at most one row can match and there is no first-row-wins ambiguity; and the mail goes
      to the account's stored `email`, never to what was typed here, so a request cannot
      redirect a reset link anywhere. Whoever receives it is the person holding the mailbox,
      which is exactly who should own the account.

      It also cannot find less than before: canonicalEmail depends only on the lowercased
      address, so every literal match is still a canonical match. Strictly a superset.
    */
    const user = await getUserByCanonicalEmail(canonicalEmail(input.email));

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
      const { subject, body } = passwordResetMessage(user.name, link, user.locale);
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
authRoutes.post(api.auth.resetPassword.path, recoveryLimiter, async (req, res, next) => {
  try {
    const input = api.auth.resetPassword.input.parse(req.body);
    const token = await getValidAuthToken("password_reset", hashToken(input.token));
    if (!token) {
      return res.status(400).json({ message: "This reset link is invalid or has expired.", field: "token" });
    }

    await updateUserPassword(token.userId, await hashPassword(input.newPassword));
    // A reset is the "I think I'm compromised" path, so it must evict everything:
    // no session to preserve here, since the caller isn't signed in.
    await revokeUserCredentials(token.userId);
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

/*
  POST /api/auth/verify-email — redeem the 6-digit code. Returns the updated user.

  Behind requireAuth, which is load-bearing rather than convenience. A 6-digit code is
  not unique: at any moment several accounts hold the same one, so looking a code up by
  its hash the way the password-reset token does would hand whoever typed "000042" a
  stranger's account. The code is only ever compared against the signed-in user's own
  live token, which also means an attacker must hold a session for the account they are
  guessing at before guessing is even possible.
*/
authRoutes.post(api.auth.verifyEmail.path, requireAuth, verifyEmailLimiter, async (req, res, next) => {
  try {
    const input = api.auth.verifyEmail.input.parse(req.body);
    const sessionUser = req.user as User;

    // Re-read: the session copy can predate a verification done on another device.
    const user = await getUserById(sessionUser.id);
    if (!user) return res.status(401).json({ message: "Not signed in" });
    if (user.emailVerifiedAt) return res.status(200).json(toPublicUser(user));

    const token = await getLiveVerificationToken(user.id);
    if (!token) {
      return res.status(400).json({ message: "That code has expired. Ask for a new one.", field: "code" });
    }

    /*
      Pay for the guess before making it — and let the payment, not the count read a
      moment ago on `token`, decide whether the guess is allowed at all.

      `token.attempts` is a snapshot, and gating on it is what let a burst of concurrent
      requests each read the same zero and each get a free guess. spendVerificationAttempt
      folds the check and the increment into one UPDATE, so exactly MAX_VERIFY_ATTEMPTS
      callers can ever be served no matter how they arrive; undefined means the budget was
      already gone.

      A correct code pays too. Charging only for wrong guesses would put the check after
      the comparison, which is exactly the ordering that lets a lucky guess arriving in a
      burst ride in on a stale count — and it costs a legitimate customer nothing, because
      the token is burned by the success on the very next line.
    */
    const attempts = await spendVerificationAttempt(token.id, MAX_VERIFY_ATTEMPTS);
    if (attempts === undefined) {
      await markAuthTokenUsed(token.id);
      return res.status(429).json({ message: "Too many incorrect codes. Ask for a new one." });
    }

    /*
      timingSafeEqual over ===, on the hashes rather than the codes.

      Comparing hashes means both sides are always 64 characters, so the lengths match
      and the comparison cannot throw on a short input. Comparing raw codes would leak
      length through the exception and content through the early exit of ===. The margin
      a timing attack buys against six digits is small, but it costs one function call.
    */
    const supplied = Buffer.from(hashToken(input.code), "hex");
    const expected = Buffer.from(token.tokenHash, "hex");
    const ok = supplied.length === expected.length && timingSafeEqual(supplied, expected);

    if (!ok) {
      if (attempts >= MAX_VERIFY_ATTEMPTS) {
        await markAuthTokenUsed(token.id);
        return res.status(429).json({ message: "Too many incorrect codes. Ask for a new one." });
      }
      return res.status(400).json({ message: "That code is not right.", field: "code" });
    }

    const verified = await markEmailVerified(token.userId);
    await markAuthTokenUsed(token.id);
    res.status(200).json(toPublicUser(verified));
  } catch (err) {
    if (handleZodError(err, res)) return;
    next(err);
  }
});

// POST /api/auth/resend-verification — re-send the verification email (signed-in users).
authRoutes.post(api.auth.resendVerification.path, requireAuth, recoveryLimiter, async (req, res, next) => {
  try {
    const sessionUser = req.user as User;
    const user = await getUserById(sessionUser.id);
    if (!user) return res.status(401).json({ message: "Not signed in" });
    if (user.emailVerifiedAt) {
      return res.status(200).json({ ok: true, alreadyVerified: true });
    }
    const code = await sendEmailVerification(user);
    res.status(200).json({ ok: true, ...(EXPOSE_DEV_TOKEN ? { devToken: code } : {}) });
  } catch (err) {
    next(err);
  }
});
