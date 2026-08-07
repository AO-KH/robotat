import { describe, it, expect } from "vitest";
import { en } from "../client/src/i18n/en";
import { ar } from "../client/src/i18n/ar";

/**
 * A key present in one dictionary and not the other is invisible until someone switches
 * language on the page that uses it — and then `t()` renders the dotted path itself, so
 * the page reads "booking.title" mid-sentence.
 *
 * Compares key sets rather than counts: two dictionaries can hold 283 keys each and
 * still disagree about which 283.
 *
 * Arrays are descended into and indexed, which is not a detail. This guard used to treat
 * an array as a single opaque leaf, so home.capabilities (5 entries), home.environments
 * (3), home.phases (3) and services.items (4) each counted as ONE key and their contents
 * were never compared — most of the marketing copy. Dropping the last phase from ar.ts,
 * halving services.items, blanking a capability, or deleting a key from inside a phase
 * all left this green.
 *
 * Indexing also makes a length mismatch surface as a missing key rather than passing
 * silently, and that is the case with teeth: Home.tsx aligns ENV_IMAGES with
 * dict.home.environments BY INDEX, so one dropped element in one language slides every
 * image after it onto the wrong section.
 */
function flatten(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((child, i) => flatten(child, prefix ? `${prefix}.${i}` : String(i)));
  }
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n dictionaries", () => {
  const enKeys = flatten(en).sort();
  const arKeys = flatten(ar).sort();

  it("are not empty (the comparison is not passing on two blank objects)", () => {
    expect(enKeys.length).toBeGreaterThan(100);
  });

  it("hold exactly the same keys", () => {
    const missingFromAr = enKeys.filter((k) => !arKeys.includes(k));
    const missingFromEn = arKeys.filter((k) => !enKeys.includes(k));
    expect({ missingFromAr, missingFromEn }).toEqual({ missingFromAr: [], missingFromEn: [] });
  });

  it("have no Arabic value left as its English original", () => {
    // A copied-but-untranslated string is worse than a missing one: it looks finished.
    //
    // The test asks whether the ARABIC value contains Arabic script, not whether the
    // English one is pure ASCII. The ASCII form of this check was close to useless here:
    // 36 of the 379 English strings carry an em-dash or an ellipsis — this codebase's
    // voice is full of them — and every one of those was permanently ineligible, so
    // footer.tagline or home.capsSub could be pasted verbatim into ar.ts and the guard
    // would stay green. Asking about the Arabic side instead is indifferent to
    // punctuation and catches all 379.
    //
    // ALLOWED still carries the identifiers, which is the one case where a Latin value
    // in the Arabic dictionary is correct:
    //   - Brand names. shared/schema.ts declares the products table's `name` column
    //     untranslated, and the Fleet page renders it from there — translating them here
    //     would give one product two different Arabic names depending on the page.
    //   - Industry acronyms the Arabic copy already uses untranslated (see home.phases,
    //     which writes "نظام ERP" in prose).
    //   - Placeholder hints that are examples of the FORMAT a field accepts rather than
    //     prose. An Arabic-script example address would misrepresent what you can type.
    //
    // No length floor: the Arabic-script test makes one unnecessary. The only value under
    // four characters that reaches this point is lang.en ("EN"), an identifier, and it is
    // listed below like any other.
    const HAS_ARABIC = /[؀-ۿ]/;
    const ALLOWED = new Set([
      "ROBOTAT",
      "NASL",
      "WhatsApp",
      "EN",
      "ع",
      "HA",
      "X-Grass Cutter",
      "X-Cultivator · X-Sprayer",
      "FMS · ERP",
      "you@example.com",
      "https://maps.app.goo.gl/…",
    ]);
    const offenders: string[] = [];

    /*
      Object.keys covers array indices too, so this already descended into arrays — but
      only as far as the Arabic side went. Where ar.ts held a shorter array or was missing
      a branch entirely, the recursion hit `undefined` and returned without a word, so a
      whole sub-tree quietly stopped being checked. A shape that does not line up is now
      an offender in its own right: the key-set test above should catch it first, and if
      it somehow does not, this failing loudly beats it passing quietly.
    */
    const walk = (enNode: unknown, arNode: unknown, path: string) => {
      if (typeof enNode === "string") {
        if (typeof arNode !== "string") {
          offenders.push(`${path}: no Arabic value (found ${arNode === undefined ? "nothing" : typeof arNode})`);
          return;
        }
        const looksUntranslated =
          enNode === arNode && !HAS_ARABIC.test(arNode) && !ALLOWED.has(arNode);
        if (looksUntranslated) offenders.push(`${path}: "${enNode}"`);
        return;
      }
      if (enNode && typeof enNode === "object") {
        if (!arNode || typeof arNode !== "object") {
          offenders.push(`${path}: no Arabic branch (found ${arNode === undefined ? "nothing" : typeof arNode})`);
          return;
        }
        for (const key of Object.keys(enNode as object)) {
          walk(
            (enNode as Record<string, unknown>)[key],
            (arNode as Record<string, unknown>)[key],
            path ? `${path}.${key}` : key,
          );
        }
      }
    };

    walk(en, ar, "");
    expect(offenders).toEqual([]);
  });

  it("has no blank string in either dictionary", () => {
    /*
      The one way to break an array entry that indexing the keys does not catch: leave
      the shape intact and empty the strings inside it. The key sets still match, and the
      untranslated check compares en to ar, so "" against real English copy looks like a
      translation. On the page it renders as a card with a heading and no words in it.
    */
    const blanks: string[] = [];
    const collect = (node: unknown, path: string, lang: string) => {
      if (typeof node === "string") {
        if (node.trim() === "") blanks.push(`${lang}.${path}`);
        return;
      }
      if (node && typeof node === "object") {
        for (const key of Object.keys(node as object)) {
          collect((node as Record<string, unknown>)[key], path ? `${path}.${key}` : key, lang);
        }
      }
    };
    collect(en, "", "en");
    collect(ar, "", "ar");
    expect(blanks).toEqual([]);
  });
});
