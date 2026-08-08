import "dotenv/config";
import { randomBytes } from "node:crypto";

// Everything that touches the database is imported dynamically, below the production
// check. `server/lib/db` pulls in `server/lib/env`, which validates configuration at
// import time and exits — so a static import here would mean a production run failed
// with "SESSION_SECRET is still the shared development secret" instead of the actual
// reason, and this script's own refusal would never run at all. Guard first, load
// second.

/**
 * Mint a disposable staff account for looking at /admin and /admin/analytics.
 *
 * Those two screens need a `staff` role, which meant that verifying them required
 * either editing the database by hand or knowing an existing admin's password.
 * Neither is something a person or an agent should be doing casually, so both were
 * repeatedly — and correctly — refused, and the screens went unverified through
 * three branches that changed their typography, spacing and error states.
 *
 * This is that capability made explicit and safe rather than ad hoc:
 *
 *   - it refuses outright in production, so it cannot become a back door;
 *   - the password is generated, never chosen, so there is no fixed credential in
 *     the repo or in anyone's shell history;
 *   - it prints once and is not stored anywhere by this script;
 *   - it hashes through the app's own `hashPassword`, so the account is an ordinary
 *     user rather than something the real login path treats specially.
 *
 * The account is disposable. Delete it when you are done:
 *   npm run dev:staff -- --delete <email>
 */

const PRODUCTION_REFUSAL = `
Refusing to run: NODE_ENV is "production".

This creates an account with staff privileges. It exists for local development only.
If you genuinely need a staff user in production, create it deliberately through your
own administrative process — not through a convenience script.
`;

function generatePassword(): string {
  // 18 bytes of base64url ≈ 24 chars. Long enough that it is never worth reusing,
  // short enough to retype into a login form once.
  return randomBytes(18).toString("base64url");
}

/** Loaded only after the production check has passed. */
async function loadDeps() {
  const [{ eq }, { db }, { users }, { hashPassword, canonicalEmail }] = await Promise.all([
    import("drizzle-orm"),
    import("../server/lib/db"),
    import("../shared/schema"),
    import("../server/modules/auth/auth.service"),
  ]);
  return { eq, db, users, hashPassword, canonicalEmail };
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.error(PRODUCTION_REFUSAL);
    process.exitCode = 1;
    return;
  }

  const { eq, db, users, hashPassword, canonicalEmail } = await loadDeps();

  const deleteAccount = async (email: string): Promise<void> => {
    const [gone] = await db.delete(users).where(eq(users.email, email.toLowerCase())).returning();
    console.log(gone ? `Deleted ${gone.email} (id ${gone.id}).` : `No user with email ${email}.`);
  };

  const args = process.argv.slice(2);
  const deleteIndex = args.indexOf("--delete");
  if (deleteIndex !== -1) {
    const target = args[deleteIndex + 1];
    if (!target) {
      console.error("Usage: npm run dev:staff -- --delete <email>");
      process.exitCode = 1;
      return;
    }
    await deleteAccount(target);
    return;
  }

  // A distinctive, obviously-disposable address so these are easy to spot and purge.
  const email = (args[0] ?? `dev-staff-${Date.now()}@robotat.invalid`).toLowerCase();
  const password = generatePassword();

  const [existing] = await db.select().from(users).where(eq(users.email, email));

  if (existing) {
    await db
      .update(users)
      .set({ role: "staff", passwordHash: await hashPassword(password) })
      .where(eq(users.id, existing.id));
    console.log(`\nPromoted the existing account ${email} to staff and reset its password.`);
  } else {
    await db.insert(users).values({
      email,
      // Through the app's own canonicalEmail, not a copy of the rule. The column is
      // NOT NULL and uniquely indexed as of migration 0011, so omitting it made this
      // script fail outright — the sanctioned way into /admin stopped working, which
      // is exactly the "no supported way in" this script was written to end. Deriving
      // it the same way registration does also means a disposable account collides
      // with a real one under the same one-inbox-one-account rule rather than
      // sneaking past it.
      emailCanonical: canonicalEmail(email),
      name: "Dev Staff",
      passwordHash: await hashPassword(password),
      role: "staff",
      // Dated so the unverified-email banner does not sit over the screens you came
      // here to look at. The column is a timestamp, not a boolean.
      emailVerifiedAt: new Date(),
    });
    console.log(`\nCreated a disposable staff account.`);
  }

  console.log(`
  email     ${email}
  password  ${password}

This is printed once and stored nowhere. Sign in, look at /admin and
/admin/analytics, then remove it:

  npm run dev:staff -- --delete ${email}
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
