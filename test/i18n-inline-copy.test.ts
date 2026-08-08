import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Copy belongs in the dictionaries — a convention CLAUDE.md states and nothing enforced.
 *
 * A literal `placeholder="John Doe"` renders byte for byte in Arabic, and a Western name
 * as the hint on a Saudi farm's signup form tells the customer the app was not built for
 * them. Placeholders are the easiest kind to miss because they read as markup.
 *
 * Scans for a literal that starts with a letter. `placeholder="+966…"` and
 * `placeholder="000000"` are format masks, not prose, and pass.
 */
const LITERAL_PLACEHOLDER = /placeholder="[A-Za-z]/;

/**
 * `aria-label` is copy too, and it was the half nobody was looking at.
 *
 * A placeholder at least renders where a sighted reviewer can see it is English. An
 * aria-label renders nowhere — it is read aloud, and only to the people least able to
 * work around it. Both offenders this caught sat next to a correctly translated sibling:
 * the booking modal's back button beside `t("booking.close")`, and the mobile menu button
 * in a navigation bar where every visible word was already translated. Two icon buttons
 * that announced themselves in English on an otherwise Arabic screen, through three
 * branches of i18n work and two guards that both passed.
 *
 * Only `aria-label`. `alt` is deliberately not scanned: the only literals are
 * `alt="ROBOTAT by NASL"`, and the brand name stays Latin in both languages for the same
 * reason it does in the mail — it is an identifier, not a word.
 */
const LITERAL_ARIA_LABEL = /aria-label="[A-Za-z]/;

/*
  shadcn primitives ROBOTAT does not render. breadcrumb, pagination and sidebar arrived
  with the component library, are imported by nothing, and carry upstream's English
  aria-labels. Translating dead code would be noise; the exclusion is listed by name
  rather than by directory so that a primitive the app actually starts using has to be
  removed from this list deliberately.
*/
const UNRENDERED_PRIMITIVES = ["breadcrumb.tsx", "pagination.tsx", "sidebar.tsx"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx$/.test(entry) ? [full] : [];
  });
}

describe("user-facing copy", () => {
  /*
    All of client/src, not just features/.

    The convention is codebase-wide and the scan was not: components/layout holds
    Navigation and Footer — as customer-facing as any page — and components/ui holds the
    input primitives that a hardcoded hint is most likely to be pasted into. Neither was
    ever looked at, so the guard's docstring and its coverage disagreed, which is the
    worst state for a guard to be in: it reads as settled.
  */
  const root = path.resolve(__dirname, "..", "client", "src");
  const files = walk(root);

  it("finds files to scan", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("reaches outside features/", () => {
    // The widening is the point, and a future refactor that moves the scan root back
    // would otherwise leave this file green while checking half of what it claims to.
    expect(files.some((f) => !f.includes(`${path.sep}features${path.sep}`))).toBe(true);
  });

  const scan = (pattern: RegExp, skip: string[] = []) =>
    files
      .filter((file) => !skip.some((name) => file.endsWith(name)))
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => pattern.test(line))
          .map(({ n, line }) => `${path.relative(root, file)}:${n} ${line.trim()}`),
      );

  it("has no hardcoded placeholder text outside the dictionaries", () => {
    expect(scan(LITERAL_PLACEHOLDER)).toEqual([]);
  });

  it("has no hardcoded aria-label text outside the dictionaries", () => {
    expect(scan(LITERAL_ARIA_LABEL, UNRENDERED_PRIMITIVES)).toEqual([]);
  });
});
