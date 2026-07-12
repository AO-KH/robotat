import { z } from "zod";

const DEV_SESSION_SECRET = "robotat-dev-secret-change-me";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required — the app cannot start without a database."),
  SESSION_SECRET: z.string().default(DEV_SESSION_SECRET),
});

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

// In production, refuse to run on the shared dev session secret — a known secret
// lets anyone forge session cookies.
if (env.NODE_ENV === "production") {
  if (env.SESSION_SECRET === DEV_SESSION_SECRET || env.SESSION_SECRET.length < 16) {
    fail("SESSION_SECRET must be set to a strong, unique value (≥16 characters) in production.");
  }
}
