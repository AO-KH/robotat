import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { pool } from "../../lib/db";
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

/** Strip the password hash before sending a user to the client. */
export function toPublicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
}

export function setupAuth(app: Express): void {
  const PgStore = connectPgSimple(session);

  app.set("trust proxy", 1);
  app.use(
    session({
      store: new PgStore({ pool, tableName: "user_sessions", createTableIfMissing: true }),
      secret: process.env.SESSION_SECRET || "robotat-dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

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
