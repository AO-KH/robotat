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

  it("has no hardcoded placeholder text outside the dictionaries", () => {
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => LITERAL_PLACEHOLDER.test(line))
        .map(({ n, line }) => `${path.relative(root, file)}:${n} ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
