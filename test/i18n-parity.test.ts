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
 */
function flatten(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
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
    ]);
    const offenders: string[] = [];

    const walk = (enNode: unknown, arNode: unknown, path: string) => {
      if (typeof enNode === "string" && typeof arNode === "string") {
        const looksUntranslated =
          enNode === arNode && !HAS_ARABIC.test(arNode) && !ALLOWED.has(arNode);
        if (looksUntranslated) offenders.push(`${path}: "${enNode}"`);
        return;
      }
      if (enNode && arNode && typeof enNode === "object" && typeof arNode === "object") {
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
});
