import { describe, it, expect } from "vitest";
import { scrypt as scryptCb, randomBytes } from "crypto";
import { promisify } from "util";
import { hashPassword, verifyPassword, needsRehash } from "../server/modules/auth/auth.service";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
  options?: { N?: number; r?: number; p?: number; maxmem?: number },
) => Promise<Buffer>;

const PASSWORD = "correct horse battery staple";

/** A hash in the ORIGINAL format: `<hashhex>.<salthex>`, node's default parameters. */
async function legacyHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `${derived.toString("hex")}.${salt}`;
}

/** A hash in the current format at arbitrary parameters, built independently of the app. */
async function taggedHash(password: string, N: number, r: number, p: number, keylen = 64): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, keylen, { N, r, p, maxmem: 256 * N * r });
  return `scrypt$${N}$${r}$${p}$${salt}$${derived.toString("hex")}`;
}

describe("password hashing", () => {
  it("writes the parameters into the stored value", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(stored).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
  });

  it("round-trips, and rejects the wrong password", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(await verifyPassword(PASSWORD + "!", stored)).toBe(false);
  });

  it("uses a fresh salt per hash, so two identical passwords do not collide", async () => {
    const [a, b] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(PASSWORD, a)).toBe(true);
    expect(await verifyPassword(PASSWORD, b)).toBe(true);
  });
});

/*
  The reason the format changed. Every one of these is a row that already exists in a
  production users table, and a deploy that cannot verify them is every customer locked
  out at once with no error and no way back except a reset each.
*/
describe("hashes written before the format carried its parameters", () => {
  it("still verify", async () => {
    const stored = await legacyHash(PASSWORD);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
  });

  it("still reject a wrong password", async () => {
    const stored = await legacyHash(PASSWORD);
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });

  it("are flagged for rewriting even though their parameters match today's", async () => {
    // The values are identical to SCRYPT's; it is the untagged shape that has to go, so
    // the legacy branch eventually has nothing left to serve.
    expect(needsRehash(await legacyHash(PASSWORD))).toBe(true);
  });
});

/*
  What the whole change is for: the cost becomes a constant someone can raise, instead of
  a value baked into both halves of the operation where changing it invalidates the table.
*/
describe("parameters are read from the record, not from the code", () => {
  it("verifies a hash made with a LOWER cost than the current setting", async () => {
    const stored = await taggedHash(PASSWORD, 1024, 8, 1);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(needsRehash(stored)).toBe(true);
  });

  it("verifies a hash made with a HIGHER cost — the case that has to work on the day the cost is raised", async () => {
    // 65536 * 8 * 128 = 64 MiB, which is past node's 32 MiB default maxmem. This passing
    // is what proves maxmemFor derives the ceiling instead of leaving it fixed; without
    // it this throws "Invalid scrypt params" rather than returning false.
    const stored = await taggedHash(PASSWORD, 65536, 8, 1);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });

  it("verifies a hash made with a different key length", async () => {
    const stored = await taggedHash(PASSWORD, 16384, 8, 1, 32);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(needsRehash(stored)).toBe(true); // 32 != the current 64
  });

  it("does not flag a hash already at the current parameters", async () => {
    expect(needsRehash(await hashPassword(PASSWORD))).toBe(false);
  });
});

/*
  A stored value that cannot be parsed must fail the login, not the request. Throwing out
  of here surfaces as a 500 on sign-in, which reads as an outage rather than as the bad
  password it actually is.
*/
describe("unreadable stored values", () => {
  const junk = [
    "",
    "not-a-hash",
    "scrypt$",
    "scrypt$abc$8$1$salt$deadbeef", // N is not a number
    "scrypt$0$8$1$salt$deadbeef", // N below the minimum
    "scrypt$16384$8$1$$deadbeef", // no salt
    "scrypt$16384$8$1$salt$", // no hash
    "scrypt$16384$8$1$salt$zzzz", // hash is not hex
    ".onlyasalt",
    "onlyahash.",
  ];

  for (const stored of junk) {
    it(`returns false rather than throwing for ${JSON.stringify(stored)}`, async () => {
      await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(false);
    });
  }

  it("leaves an unreadable value alone rather than proposing a rewrite", () => {
    // Rewriting on the strength of a value nobody could verify would replace a row that
    // might still be recoverable with one derived from an attacker's guess.
    expect(needsRehash("not-a-hash")).toBe(false);
    expect(needsRehash("")).toBe(false);
  });

  it("rejects a value whose parameters scrypt itself refuses", async () => {
    // N must be a power of two; 16385 is not, so scrypt throws internally.
    await expect(verifyPassword(PASSWORD, "scrypt$16385$8$1$abcd$deadbeef")).resolves.toBe(false);
  });
});
