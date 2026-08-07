import { z } from "zod";

const DEV_SESSION_SECRET = "robotat-dev-secret-change-me";

/** Minimum SESSION_SECRET length accepted in production (~192 bits of base64). */
const MIN_SECRET_LENGTH = 32;

/**
 * Placeholder secrets that must never reach production. Matched as case-insensitive
 * substrings so variants ("Change-Me-In-Production", "changeme123") are caught too.
 * A long placeholder still passes a naive length check — that is exactly how
 * docker-compose.yml's "change-me-in-production" (23 chars) slipped through before.
 */
const PLACEHOLDER_PATTERNS = [
  "change-me",
  "changeme",
  "change-this",
  "changethis",
  "your-secret",
  "secret-here",
  "placeholder",
  "example",
  "insecure",
  "todo",
];

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required — the app cannot start without a database."),
  SESSION_SECRET: z.string().default(DEV_SESSION_SECRET),
  // Absolute origin used to build emailed links (password reset, email verification).
  // Required in production: without it those links are built from the request's Host
  // header, which an attacker controls — see validateProduction().
  PUBLIC_APP_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url("PUBLIC_APP_URL must be an absolute URL, e.g. https://robotat.nasl-tech.com").optional(),
  ),
  // Comma-separated extra origins allowed to call the API cross-origin, e.g. a
  // separately-hosted web client. The Capacitor origins are always allowed and do
  // not need listing here.
  CORS_ORIGINS: z.string().optional(),

  /**
   * Divert every outgoing email to this address instead of its real recipient.
   *
   * For exercising a live SMTP setup without mailing real customers. Validated as an
   * address so a typo fails at boot rather than silently sending nowhere, and refused
   * outright in production by validateProduction() below.
   */
  MAIL_REDIRECT_TO: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().email("MAIL_REDIRECT_TO must be a valid email address").optional(),
  ),
});

export type Env = z.infer<typeof schema>;

/**
 * Production-only invariants, as a pure function so they can be tested.
 * Returns a list of problems; empty means the configuration is acceptable.
 */
export function validateProduction(env: Env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const problems: string[] = [];

  const secret = env.SESSION_SECRET;
  const lowered = secret.toLowerCase();
  if (secret === DEV_SESSION_SECRET) {
    problems.push("SESSION_SECRET is still the shared development secret.");
  } else if (PLACEHOLDER_PATTERNS.some((p) => lowered.includes(p))) {
    problems.push("SESSION_SECRET looks like a placeholder value.");
  } else if (secret.length < MIN_SECRET_LENGTH) {
    problems.push(`SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
  }

  if (!env.PUBLIC_APP_URL) {
    problems.push(
      "PUBLIC_APP_URL is required in production — without it, password-reset links " +
        "are built from the attacker-controlled Host header.",
    );
  } else if (!env.PUBLIC_APP_URL.startsWith("https://")) {
    problems.push("PUBLIC_APP_URL must use https:// in production (session cookies are Secure-only).");
  }

  if (env.MAIL_REDIRECT_TO) {
    problems.push(
      `MAIL_REDIRECT_TO is set to "${env.MAIL_REDIRECT_TO}". It diverts every outgoing ` +
        "email to one address, so in production no customer would receive their booking " +
        "confirmation, status update, password reset or verification code — while the logs " +
        "still read as if mail went out. It exists for testing a live SMTP setup and has no " +
        "production use. Unset it.",
    );
  }

  return problems;
}

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`).join("\n");
  fail(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;

const problems = validateProduction(env);
if (problems.length > 0) {
  fail(
    `Invalid production configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}\n\n` +
      `  Generate a strong secret with:  openssl rand -base64 32`,
  );
}
