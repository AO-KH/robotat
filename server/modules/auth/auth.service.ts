import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import {
  scrypt,
  randomBytes,
  randomInt,
  timingSafeEqual,
  createHash,
  createHmac,
  type ScryptOptions,
} from "crypto";
import { promisify } from "util";
import { pool } from "../../lib/db";
import { env } from "../../lib/env";
import { log } from "../../lib/log";
import { getUserByEmail, getUserById, updateUserPassword } from "./auth.storage";
import type { User, PublicUser } from "@shared/schema";

/*
  Typed by hand because promisify's inferred signature drops the options argument: node's
  scrypt has several overloads and TypeScript resolves the promisified form to the
  three-parameter one, so passing { N, r, p, maxmem } fails to compile even though it is
  forwarded correctly at runtime (promisify appends the callback after whatever it is
  given). Without the options argument the parameters could not be varied at all, which
  is the entire point of the format below.
*/
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
  options?: ScryptOptions,
) => Promise<Buffer>;

/* ============================================================
 * Password hashing
 *
 * Stored as `scrypt$<N>$<r>$<p>$<salthex>$<hashhex>` — the parameters travel with the
 * hash, which is the whole point of the format.
 *
 * The original format was `<hashhex>.<salthex>` with the parameters merely implied:
 * verification re-derived using whatever the defaults happened to be at the time. That
 * makes the cost unraisable rather than merely low. Adding `{ N: 32768 }` to the hashing
 * call would have changed what verification computed too, so every hash in the table
 * would have stopped matching at once and every existing customer would have been locked
 * out — with no error, no failed deploy, and no way back except a password reset each.
 *
 * Reading the parameters out of the record being checked removes that: old hashes keep
 * verifying under the parameters they were made with, new ones use the current values,
 * and the two coexist for as long as it takes everyone to sign in once.
 * ========================================================== */

/**
 * Parameters for NEW hashes. Safe to raise now — see maxmemFor on the memory ceiling,
 * and upgradePasswordHash on how existing rows catch up.
 *
 * Left at node's defaults in the commit that introduced this format, deliberately: memory
 * use is 128 * N * r bytes PER CONCURRENT HASH, so N = 32768 is 33 MB a login and
 * N = 131072 is 134 MB a login. On a small container that is an out-of-memory risk under
 * a burst, and it is a decision that wants a look at the deployment rather than a default
 * chosen here. The format is what was blocking it; this constant is now a one-line change.
 */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

const SCRYPT_PREFIX = "scrypt";

/** Parameters the original `<hash>.<salt>` format was produced under: node's defaults. */
const LEGACY_SCRYPT = { N: 16384, r: 8, p: 1 } as const;

/**
 * Memory ceiling to allow scrypt, derived from the parameters rather than fixed.
 *
 * scrypt needs about 128 * N * r bytes and node refuses above `maxmem`, which defaults to
 * 32 MiB — so raising N past 32768 without also raising this fails with "Invalid scrypt
 * params", an error that names neither the parameter at fault nor the ceiling it hit.
 * Computing it here means the cap can never be the thing that stops an upgrade.
 */
function maxmemFor(N: number, r: number): number {
  return 256 * N * r; // twice what the algorithm asks for
}

function derive(password: string, salt: string, N: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return scryptAsync(password, salt, keylen, { N, r, p, maxmem: maxmemFor(N, r) }) as Promise<Buffer>;
}

interface StoredHash {
  N: number;
  r: number;
  p: number;
  keylen: number;
  salt: string;
  hash: Buffer;
  tagged: boolean;
}

/**
 * Read a stored hash in either format, or null if it is not one.
 *
 * `keylen` comes from the length of the stored hash rather than from a constant: deriving
 * at a different length produces a value that cannot match, so the record has to be the
 * authority on that too.
 */
function parseStoredHash(stored: string): StoredHash | null {
  if (stored.startsWith(`${SCRYPT_PREFIX}$`)) {
    const [, nRaw, rRaw, pRaw, salt, hashHex] = stored.split("$");
    const N = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
    if (N < 2 || r < 1 || p < 1 || !salt || !hashHex) return null;
    const hash = Buffer.from(hashHex, "hex");
    if (hash.length === 0) return null;
    return { N, r, p, keylen: hash.length, salt, hash, tagged: true };
  }

  const [hashHex, salt] = stored.split(".");
  if (!hashHex || !salt) return null;
  const hash = Buffer.from(hashHex, "hex");
  if (hash.length === 0) return null;
  return { ...LEGACY_SCRYPT, keylen: hash.length, salt, hash, tagged: false };
}

/** Hash a password with a per-user random salt, tagged with the parameters used. */
export async function hashPassword(password: string): Promise<string> {
  const { N, r, p, keylen } = SCRYPT;
  const salt = randomBytes(16).toString("hex");
  const derived = await derive(password, salt, N, r, p, keylen);
  return `${SCRYPT_PREFIX}$${N}$${r}$${p}$${salt}$${derived.toString("hex")}`;
}

/** Constant-time compare of a plaintext password against a stored hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;

  try {
    const derived = await derive(password, parsed.salt, parsed.N, parsed.r, parsed.p, parsed.keylen);
    return parsed.hash.length === derived.length && timingSafeEqual(parsed.hash, derived);
  } catch {
    // Parameters that scrypt rejects — a corrupted row, or one written by something that
    // is not this code. It cannot be verified, and a throw here would surface as a 500 on
    // sign-in rather than as the failed attempt it actually is.
    return false;
  }
}

/**
 * Whether a stored hash was made under weaker parameters than the current ones, or in
 * the untagged legacy format.
 *
 * Untagged rows are rewritten even when their parameters already match, so the table
 * converges on one format and the legacy branch above eventually has nothing to serve.
 */
export function needsRehash(stored: string): boolean {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false; // unreadable; verification already fails, rewriting it would lose the row
  return (
    !parsed.tagged ||
    parsed.N < SCRYPT.N ||
    parsed.r < SCRYPT.r ||
    parsed.p < SCRYPT.p ||
    parsed.keylen !== SCRYPT.keylen
  );
}

/**
 * A hash of a password nobody knows, for accounts that do not exist.
 *
 * Built at module load through the app's own hashPassword so it tracks the real scrypt
 * parameters. Pinning a literal here would silently stop matching the day those change,
 * and the defence would decay without any test noticing.
 */
const decoyHash = hashPassword(randomBytes(32).toString("hex"));

/**
 * Check a password against an account that may not exist, in the same time either way.
 *
 * Both credential endpoints used to answer an unknown address by returning before scrypt
 * ran. Scrypt is deliberately expensive — measured here, a miss came back in 3ms against
 * 40ms for a registered address — so "is this email registered?" was a question anyone
 * could ask from the outside, twelve times faster than the honest answer, without
 * tripping a 409 or sending the owner a single email. Paired with the duplicate-address
 * 409 on register, that turns the customer list into something enumerable.
 *
 * So the miss path pays the same cost: the supplied password is verified against a decoy
 * that cannot match. The outcome is unchanged — an unknown address still fails.
 */
export async function verifyCredentials(
  password: string,
  user: Pick<User, "passwordHash"> | null | undefined,
): Promise<boolean> {
  if (user) return verifyPassword(password, user.passwordHash);
  await verifyPassword(password, await decoyHash);
  return false;
}

/**
 * Rewrite a password hash at the current parameters, on a sign-in that just proved the
 * password. Best effort — this is an upgrade, not part of authenticating.
 *
 * A hash cannot be strengthened without the plaintext, and the only moment the server
 * legitimately holds it is the instant a correct one arrives. So the fleet converges by
 * people signing in, and an account that never signs in again keeps verifying under the
 * parameters it was made with, which is the point of storing them.
 *
 * Failures are swallowed: a database hiccup during the rewrite must not turn a correct
 * password into a failed login. The next sign-in tries again.
 *
 * Worth knowing when the cost is eventually raised: until a given row is rewritten, it
 * verifies more cheaply than the decoy in verifyCredentials, which is minted at the new
 * parameters — so the timing equalisation that hides account existence is briefly
 * imperfect in the other direction (a known account answers faster than an unknown one)
 * for exactly as long as that account has not signed in since the change.
 */
export async function upgradePasswordHash(user: User, password: string): Promise<void> {
  if (!needsRehash(user.passwordHash)) return;
  try {
    await updateUserPassword(user.id, await hashPassword(password));
  } catch (err) {
    log(`password hash upgrade failed for user ${user.id}: ${String(err)}`, "auth");
  }
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

/**
 * Providers where `user+anything@` is documented to reach `user@`.
 *
 * Kept to a list rather than applied everywhere, because `+` is a legal character in a
 * local part and some hosts treat it literally. Merging two genuinely separate people
 * is a worse failure than letting one extra alias through.
 */
const PLUS_ALIAS_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "protonmail.com",
  "proton.me",
  "fastmail.com",
]);

/** Domains that also ignore dots in the local part. Effectively Google's. */
const DOT_INSENSITIVE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * One inbox, one identity.
 *
 * Lowercasing alone is not enough to stop one person holding many accounts: Gmail
 * ignores dots and everything after a `+`, so abdullahkh250@, abdullah.kh250@ and
 * abdullahkh250+farm@ are three registrations that all land in the same mailbox. Each
 * would receive its own verification code, verify cleanly, and carry its own allowance
 * under the per-account booking limit — which is how a three-a-day cap becomes fifteen.
 *
 * This is the value the uniqueness check runs against. The address the customer typed is
 * still what gets stored and written to, because that is the one they recognise on an
 * envelope; only the comparison is normalised.
 *
 * googlemail.com folds into gmail.com — Google's own alias for the same mailbox.
 */
export function canonicalEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed; // not an address shape; nothing to canonicalise

  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  if (PLUS_ALIAS_DOMAINS.has(domain)) local = local.split("+")[0];
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) local = local.replaceAll(".", "");

  // An address that is nothing but a +suffix would canonicalise to an empty local part,
  // which is not an address at all. Fall back rather than invent one.
  if (!local) return trimmed;

  return `${local}@${domain === "googlemail.com" ? "gmail.com" : domain}`;
}

/**
 * Mint a 6-digit email verification code and its storage hash.
 *
 * `randomInt` rather than `randomBytes(...) % 1_000_000`: the modulo of a byte range
 * that is not a multiple of a million is biased toward the low codes, and a code space
 * this small cannot afford to hand out some values more often than others. `randomInt`
 * rejects and re-draws instead.
 *
 * Padded, so 42 is "000042" and every code is six characters — a five-character code in
 * a six-box input is the kind of thing that gets reported as "the code doesn't work".
 */
export function generateVerificationCode(): { code: string; tokenHash: string } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { code, tokenHash: hashToken(code) };
}

/** Token lifetimes. */
export const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60; // 1 hour

/**
 * Fifteen minutes, where the emailed link had twenty-four hours.
 *
 * A 32-byte token is unguessable for as long as you care to leave it valid. A 6-digit
 * code is one of a million, so its lifetime is part of its strength: the window in which
 * guesses can be made is exactly this long, and it is also roughly how long someone will
 * sit with the signup screen open before giving up and asking for a new one.
 */
export const EMAIL_VERIFY_TTL_MS = 1000 * 60 * 15;

/**
 * Wrong guesses allowed against one verification code before it is burned.
 *
 * Five is enough to survive a genuine typo or two and nowhere near enough to search a
 * million codes. Combined with the fifteen-minute window and the code only ever being
 * checked against the signed-in user's own token, guessing is not a practical attack.
 */
export const MAX_VERIFY_ATTEMPTS = 5;

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

/**
 * Mint a signed bearer token for a user.
 *
 * `ver` pins the token to the user's current `tokenVersion`. Because the token is
 * stateless there is nothing to delete server-side, so revocation works by bumping
 * that column (see revokeUserTokens): every token carrying an older `ver` stops
 * verifying immediately. Without it, resetting a password left a stolen token valid
 * for the rest of its 30 days.
 */
export function issueToken(userId: number, tokenVersion: number): string {
  const payload = b64url(JSON.stringify({ sub: userId, ver: tokenVersion, exp: Date.now() + BEARER_TTL_MS }));
  const sig = b64url(createHmac("sha256", env.SESSION_SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

/** Verify a bearer token; throws if malformed, tampered, or expired. */
export function verifyToken(token: string): { sub: number; ver: number } {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) throw new Error("Malformed token");

  const expected = b64url(createHmac("sha256", env.SESSION_SECRET).update(payload).digest());
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new Error("Bad signature");

  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
    sub?: unknown;
    ver?: unknown;
    exp?: unknown;
  };
  if (
    typeof data.sub !== "number" ||
    typeof data.ver !== "number" ||
    typeof data.exp !== "number" ||
    Date.now() > data.exp
  ) {
    throw new Error("Expired or invalid token");
  }
  return { sub: data.sub, ver: data.ver };
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
      /*
        createTableIfMissing is off because migration 0014 creates the table.

        It cannot work in the shipped artifact anyway: connect-pg-simple creates the table
        by reading `table.sql` out of its own package directory, and esbuild rewrites
        __dirname to the bundle's location, so the built server looked for
        /app/dist/table.sql and threw ENOENT on the first request that persisted a session
        — the first sign-in. Under tsx it resolved fine, which is why dev and the test
        suite never saw it.

        Leaving it on as a fallback would only restore that: an ENOENT naming a file inside
        a dependency, raised at sign-in, in place of Postgres saying plainly that a
        relation is missing. It also kept CREATE TABLE on the list of rights this process
        needs while serving traffic, which it should not have.
      */
      store: new PgStore({ pool, tableName: "user_sessions", createTableIfMissing: false }),
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
        // verifyCredentials, not verifyPassword: an unknown address must cost the same
        // as a known one. See the note on it above.
        const ok = await verifyCredentials(password, user);
        if (!ok || !user) return done(null, false, { message: "Invalid email or password" });
        // The one moment the plaintext is legitimately in hand — see upgradePasswordHash.
        await upgradePasswordHash(user, password);
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
    const { sub, ver } = verifyToken(header.slice(7).trim());
    const user = await getUserById(sub);
    // Reject tokens minted before the user's last revocation (password change or
    // reset). Free: getUserById already runs, so this costs no extra query.
    if (user && user.tokenVersion === ver) {
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
