import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { scrypt, randomBytes, timingSafeEqual, createHash, createHmac } from "crypto";
import { promisify } from "util";
import { pool } from "../../lib/db";
import { env } from "../../lib/env";
import { getUserByEmail, getUserById } from "./auth.storage";
import type { User, PublicUser } from "@shared/schema";

const scryptAsync = promisify(scrypt);

/** Hash a password with a per-user random salt: "<hexhash>.<hexsalt>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${derived.toString("hex")}.${salt}`;
}

/** Constant-time compare of a plaintext password against a stored hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [hashHex, salt] = stored.split(".");
  if (!hashHex || !salt) return false;
  const hashBuf = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return hashBuf.length === derived.length && timingSafeEqual(hashBuf, derived);
}

/** SHA-256 of a raw token — only the hash is ever stored, the raw token is emailed. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mint a random URL-safe token and its storage hash. */
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token) };
}

/** Token lifetimes. */
export const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60; // 1 hour
export const EMAIL_VERIFY_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

/* ============================================================
 * Bearer tokens — stateless auth for the native app / API clients.
 * A compact HMAC-signed token ("<payload>.<sig>", both base64url), signed with
 * SESSION_SECRET so it shares the session's trust boundary. Cookies are awkward
 * from the capacitor:// origin on iOS, so the app sends `Authorization: Bearer …`.
 * ========================================================== */
const BEARER_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days (matches the session cookie)

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Mint a signed bearer token for a user id. */
export function issueToken(userId: number): string {
  const payload = b64url(JSON.stringify({ sub: userId, exp: Date.now() + BEARER_TTL_MS }));
  const sig = b64url(createHmac("sha256", env.SESSION_SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

/** Verify a bearer token; throws if malformed, tampered, or expired. */
export function verifyToken(token: string): { sub: number } {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) throw new Error("Malformed token");

  const expected = b64url(createHmac("sha256", env.SESSION_SECRET).update(payload).digest());
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new Error("Bad signature");

  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: unknown; exp?: unknown };
  if (typeof data.sub !== "number" || typeof data.exp !== "number" || Date.now() > data.exp) {
    throw new Error("Expired or invalid token");
  }
  return { sub: data.sub };
}

/** Strip the password hash before sending a user to the client. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    emailVerified: user.emailVerifiedAt != null,
  };
}

export function setupAuth(app: Express): void {
  const PgStore = connectPgSimple(session);

  app.set("trust proxy", 1);
  app.use(
    session({
      store: new PgStore({ pool, tableName: "user_sessions", createTableIfMissing: true }),
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());
  app.use(bearerAuth);

  passport.use(
    new LocalStrategy({ usernameField: "email", passwordField: "password" }, async (email, password, done) => {
      try {
        const user = await getUserByEmail(email);
        if (!user) return done(null, false, { message: "Invalid email or password" });
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return done(null, false, { message: "Invalid email or password" });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, (user as User).id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await getUserById(id);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });
}

/**
 * If the request carries a valid `Authorization: Bearer <token>` and isn't already
 * authenticated by a session, attach the user so the normal guards accept it.
 * Invalid/expired tokens are ignored (the request stays anonymous).
 */
export const bearerAuth: RequestHandler = async (req, _res, next) => {
  if (req.user) return next(); // a session already authenticated this request

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();

  try {
    const { sub } = verifyToken(header.slice(7).trim());
    const user = await getUserById(sub);
    if (user) {
      req.user = user;
      // Make req.isAuthenticated() true so requireAuth/requireStaff/me work unchanged.
      req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    }
  } catch {
    /* invalid token — remain anonymous */
  }
  next();
};

/** Guard for endpoints that require a logged-in user. */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated?.() && req.user) return next();
  res.status(401).json({ message: "You must be signed in to do that." });
};

/** Guard for staff-only endpoints (must be signed in AND have the staff role). */
export const requireStaff: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ message: "You must be signed in to do that." });
  }
  if ((req.user as User).role !== "staff") {
    return res.status(403).json({ message: "Staff access required." });
  }
  next();
};
