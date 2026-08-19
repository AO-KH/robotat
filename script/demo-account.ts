import "dotenv/config";
import { randomInt } from "node:crypto";

// Everything touching the database is imported dynamically, below the argument parsing,
// for the same reason as script/dev-staff.ts: `server/lib/db` pulls in `server/lib/env`,
// which validates configuration at import time and exits. A static import would turn a
// misconfigured run into a confusing message about SESSION_SECRET instead of the actual
// problem, and `--help` would not work without a database.

/**
 * Create the demo account Apple's App Review team signs in with.
 *
 * The app puts its whole reason for existing behind a login wall — booking a site
 * assessment and tracking it — so a reviewer who cannot sign in sees a brochure and
 * rejects under Guideline 2.1. The credentials go in App Store Connect → App Review
 * Information; see docs/APP_STORE.md §5.
 *
 * Why this is a script rather than something done by hand once:
 *
 *   - **Email verification is a hard gate.** assessments.routes.ts refuses to book with
 *     403 until `users.email_verified_at` is set. An account registered through the
 *     public form and never verified can sign in, see an empty dashboard, and do nothing
 *     else — which looks exactly like a broken app to someone with a rejection template
 *     open. This sets the column directly, so no mail has to be received.
 *   - **An empty dashboard is a bad demo.** It is also a bad screenshot, and it is the
 *     screen that best answers "what is this app for". Three assessments are seeded
 *     across three different statuses so the list, the status pills and the counters all
 *     have something to show.
 *   - **Apple asks again.** Credentials expire, get rotated, or are wanted afresh for
 *     the next version. Re-running this is a supported operation.
 *
 * Unlike dev-staff.ts this does NOT refuse in production, because production is the
 * point: the reviewer signs in to the shipped app, which talks to the live API. The
 * reason dev-staff refuses is that it grants `staff`, and a convenience script that
 * mints admins in production is a back door. This one creates an ordinary customer with
 * no elevated role — the same thing the public registration form creates — so the
 * blast radius is one more row in `users`.
 *
 *   npx tsx script/demo-account.ts                      # create or reset, default address
 *   npx tsx script/demo-account.ts someone@example.com  # a different address
 *   npx tsx script/demo-account.ts --delete <email>     # remove it again
 *
 * DATABASE_URL selects the database, as everywhere else. Point it at production.
 */

/** Where App Review's credentials land. Override with a positional argument. */
const DEFAULT_EMAIL = "appreview@robotat.sa";

/**
 * No 0/O/1/l/I. A reviewer types this by hand off a web form, and "I could not sign in"
 * is indistinguishable from a broken build in a rejection notice — an ambiguous glyph is
 * a worse failure here than a shorter password. Four groups of four from a 32-character
 * alphabet is ~80 bits, which is far more than a throwaway account with no real data
 * behind it needs.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generatePassword(): string {
  const groups = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(""),
  );
  return groups.join("-");
}

/**
 * The seeded bookings.
 *
 * Written to look like a real account's history, because it is the Dashboard screenshot
 * as well as the reviewer's first impression — but every `message` says plainly what the
 * row is. Staff see that field in /admin, which is the one place these could otherwise
 * be mistaken for live sales leads and get an agronomist dispatched to a farm that does
 * not exist. Inserted straight into the table rather than through POST /api/assessments,
 * so no WhatsApp alert or confirmation email is sent for any of them.
 *
 * `daysFromNow` is negative for the past. The mix is deliberate: one visit already done,
 * one booked and dated (the state push notifications exist to announce), and one still
 * awaiting scheduling, so the dashboard's "awaiting scheduling" counter is not zero.
 *
 * **Do not collapse these to `now()`.** Booking is capped at DAILY_ASSESSMENT_LIMIT (3)
 * per account per rolling 24 hours, counted in the same transaction as the insert —
 * assessments.routes.ts. Three rows dated today would spend the whole allowance before
 * the reviewer touched anything, so the first thing they tried would answer "You can
 * book up to 3 site assessments a day": a 429 on the app's primary flow, indistinguishable
 * from a broken build. Backdating is what keeps the allowance clear, and the oldest of
 * these must stay more than 24 hours old for that reason and not only for realism.
 */
const SEEDED_ASSESSMENTS = [
  {
    status: "completed",
    createdDaysFromNow: -34,
    scheduledDaysFromNow: -21,
    company: "Al Kharj Date Orchard",
    landSize: "120 hectares",
    location: "Al Kharj, Riyadh Province",
    message:
      "App Store review demo record — not a real customer. Created by script/demo-account.ts.",
  },
  {
    status: "scheduled",
    createdDaysFromNow: -9,
    scheduledDaysFromNow: 6,
    company: "Tabuk Greenhouse Cluster",
    landSize: "18 hectares protected",
    location: "Tabuk",
    message:
      "App Store review demo record — not a real customer. Created by script/demo-account.ts.",
  },
  {
    status: "pending",
    createdDaysFromNow: -2,
    scheduledDaysFromNow: null,
    company: "Sakaka Solar Park",
    landSize: "300 hectares",
    location: "Al Jouf",
    message:
      "App Store review demo record — not a real customer. Created by script/demo-account.ts.",
  },
] as const;

const DEMO_NAME = "App Review";
const DEMO_PHONE = "+966500000000";

function at(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Loaded only once the arguments are known to be valid. */
async function loadDeps() {
  const [{ eq }, { db }, { users, assessments }, { hashPassword, canonicalEmail }] =
    await Promise.all([
      import("drizzle-orm"),
      import("../server/lib/db"),
      import("../shared/schema"),
      import("../server/modules/auth/auth.service"),
    ]);
  return { eq, db, users, assessments, hashPassword, canonicalEmail };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Create the App Review demo account (an ordinary customer, email pre-verified,
with three seeded assessments so the dashboard is not empty).

  npx tsx script/demo-account.ts [email]
  npx tsx script/demo-account.ts --delete <email>

Default address: ${DEFAULT_EMAIL}
DATABASE_URL selects the database.
`);
    return;
  }

  const { eq, db, users, assessments, hashPassword, canonicalEmail } = await loadDeps();

  const deleteIndex = args.indexOf("--delete");
  if (deleteIndex !== -1) {
    const target = args[deleteIndex + 1];
    if (!target) {
      console.error("Usage: npx tsx script/demo-account.ts --delete <email>");
      process.exitCode = 1;
      return;
    }
    const email = target.toLowerCase();
    // Assessments first. assessments.user_id is ON DELETE SET NULL, which is right for a
    // real customer exercising their deletion right — the visit happened and stays on the
    // books, anonymised. For demo rows it is wrong: deleting the account would leave three
    // orphaned bookings in /admin with nothing left to identify them by.
    const removed = await db.delete(assessments).where(eq(assessments.email, email)).returning();
    const [gone] = await db.delete(users).where(eq(users.email, email)).returning();
    console.log(
      gone
        ? `Deleted ${gone.email} (id ${gone.id}) and ${removed.length} seeded assessment(s).`
        : `No user with email ${email}. Removed ${removed.length} stray assessment(s).`,
    );
    return;
  }

  const email = (args.find((a) => !a.startsWith("-")) ?? DEFAULT_EMAIL).toLowerCase();
  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  const [existing] = await db.select().from(users).where(eq(users.email, email));

  let userId: number;
  if (existing) {
    // Re-running is the normal case, not an error — Apple asks for fresh credentials on
    // later submissions. Reset the password and re-verify rather than refusing, and clear
    // the old seeded rows so the dashboard does not accumulate nine bookings by the third
    // run. `role` is deliberately not touched: if someone has manually promoted this
    // account, silently demoting it would be a surprise.
    await db
      .update(users)
      .set({ passwordHash, emailVerifiedAt: new Date(), name: DEMO_NAME })
      .where(eq(users.id, existing.id));
    const cleared = await db.delete(assessments).where(eq(assessments.userId, existing.id)).returning();
    userId = existing.id;
    console.log(`\nReset the existing account ${email} and cleared ${cleared.length} old booking(s).`);
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email,
        // Through the app's own canonicalEmail rather than a copy of the rule, so this
        // account collides with a real one under the same one-inbox-one-account index
        // (migration 0011) instead of sneaking past it.
        emailCanonical: canonicalEmail(email),
        name: DEMO_NAME,
        passwordHash,
        // Left at the "customer" default on purpose. A reviewer should see what a
        // customer sees; /admin is not part of the submission.
        role: "customer",
        // The gate this script exists for. A timestamp, not a boolean.
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!created) throw new Error("Insert returned no row.");
    userId = created.id;
    console.log(`\nCreated the App Review demo account.`);
  }

  for (const row of SEEDED_ASSESSMENTS) {
    await db.insert(assessments).values({
      userId,
      name: DEMO_NAME,
      email,
      phone: DEMO_PHONE,
      company: row.company,
      landSize: row.landSize,
      location: row.location,
      message: row.message,
      status: row.status,
      locale: "en",
      scheduledAt: row.scheduledDaysFromNow === null ? null : at(row.scheduledDaysFromNow),
      createdAt: at(row.createdDaysFromNow),
    });
  }

  console.log(`
  email     ${email}
  password  ${password}

Seeded ${SEEDED_ASSESSMENTS.length} assessments (completed, scheduled, pending).

Put these in App Store Connect → App Review Information → Sign-In Information.
The password is printed once and stored nowhere by this script; re-run to get a
new one. Remove the account and its bookings with:

  npx tsx script/demo-account.ts --delete ${email}

The seeded rows appear in /admin like any other booking. Each one says in its
message field that it is review demo data, so nobody schedules a real visit.
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
