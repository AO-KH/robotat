import { readFileSync } from "node:fs";
import { describe, it, expect, afterAll } from "vitest";
import { canonicalEmail } from "../server/modules/auth/auth.service";
import { pool } from "../server/lib/db";

describe("canonicalEmail", () => {
  it("folds the Gmail alias forms onto one identity", () => {
    // All three deliver to the same mailbox, so all three are the same person.
    const target = "abdullahkh250@gmail.com";
    for (const alias of [
      "abdullahkh250@gmail.com",
      "ABDULLAHKH250@Gmail.com",
      "abdullah.kh250@gmail.com",
      "a.b.d.u.l.l.a.h.k.h.2.5.0@gmail.com",
      "abdullahkh250+farm@gmail.com",
      "abdullah.kh250+anything@GMAIL.com",
      "abdullahkh250@googlemail.com", // Google's own alias domain
    ]) {
      expect(canonicalEmail(alias)).toBe(target);
    }
  });

  it("strips +suffix on providers that document it, and leaves dots alone", () => {
    // Dots are significant outside Google — first.last@ and firstlast@ are two people.
    expect(canonicalEmail("first.last+tag@outlook.com")).toBe("first.last@outlook.com");
    expect(canonicalEmail("first.last@outlook.com")).toBe("first.last@outlook.com");
    expect(canonicalEmail("firstlast@outlook.com")).not.toBe(canonicalEmail("first.last@outlook.com"));
  });

  it("leaves an unknown domain alone apart from case", () => {
    // Merging two real people is worse than letting one alias through, so anything not
    // known to alias is compared as typed.
    expect(canonicalEmail("Sara+Farm@nasl-tech.com")).toBe("sara+farm@nasl-tech.com");
    expect(canonicalEmail("a.b@nasl-tech.com")).toBe("a.b@nasl-tech.com");
  });

  it("never produces an address with an empty local part", () => {
    // "+tag@gmail.com" would strip to "@gmail.com", which is not an address.
    expect(canonicalEmail("+tag@gmail.com")).toBe("+tag@gmail.com");
    expect(canonicalEmail("....@gmail.com")).toBe("....@gmail.com");
  });

  it("is unbothered by input that is not an address", () => {
    expect(canonicalEmail("  Not An Email ")).toBe("not an email");
    expect(canonicalEmail("@gmail.com")).toBe("@gmail.com");
  });
});

/**
 * The migrations reimplement this function in SQL, and until this block nothing checked it.
 *
 * `0011_email_canonical.sql` fills the column for rows that predate it, and `0012` rewrites
 * it for databases that ran 0011 before it was fixed. 0011's header claimed "the tests
 * assert the behaviour they share", which was simply untrue: the SQL and the TypeScript
 * had drifted on exactly the case the TypeScript guards and the SQL did not — a local part
 * that is nothing but an alias. SQL said "@gmail.com" where the function says
 * "+tag@gmail.com", so a row backfilled before the fix was never found by
 * getUserByCanonicalEmail and that mailbox was silently exempt from one-inbox-one-account.
 *
 * The expressions are read out of the .sql files rather than copied in here. A copy would
 * keep passing while the migration was wrong — the same drift with an extra step in it.
 */
const BACKFILL_MIGRATIONS = ["0011_email_canonical", "0012_email_canonical_repair"] as const;

/** Pull the CASE expression out of a backfill UPDATE, so the test runs the real thing. */
function backfillExpression(tag: string): string {
  const sql = readFileSync(new URL(`../migrations/${tag}.sql`, import.meta.url), "utf8");
  const match = sql.match(/UPDATE "users" SET "email_canonical" =([\s\S]*?);/);
  if (!match) throw new Error(`could not find the backfill UPDATE in ${tag}.sql`);
  return match[1].trim();
}

describe("the backfill SQL matches canonicalEmail()", () => {
  afterAll(async () => {
    await pool.end();
  });

  const inputs = [
    "+tag@gmail.com", // alias-only local part — the case that diverged
    "+a@outlook.com",
    "....@gmail.com", // dots-only local part, likewise empty once stripped
    "abdullah.kh+farm@gmail.com",
    "normal@gmail.com",
    "ABDULLAHKH250@Gmail.com",
    "abdullahkh250@googlemail.com",
    "first.last+tag@outlook.com",
    "first.last@outlook.com",
    "Sara+Farm@nasl-tech.com", // unknown domain: case only
    "a.b@nasl-tech.com",
  ];

  it.each(BACKFILL_MIGRATIONS)("%s agrees with the TypeScript", async (tag) => {
    // The expression reads an unqualified "email", so a VALUES list named `u("email")`
    // stands in for the users table without touching it.
    const values = inputs.map((_, i) => `($${i + 1})`).join(", ");
    const { rows } = await pool.query<{ input: string; canonical: string }>(
      `SELECT "email" AS input, (${backfillExpression(tag)}) AS canonical
         FROM (VALUES ${values}) AS u("email")`,
      inputs,
    );

    const fromSql = Object.fromEntries(rows.map((r) => [r.input, r.canonical]));
    const fromTs = Object.fromEntries(inputs.map((e) => [e, canonicalEmail(e)]));
    expect(fromSql).toEqual(fromTs);
  });
});
