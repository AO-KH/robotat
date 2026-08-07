import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { en } from "../client/src/i18n/en";

/**
 * `t()` has no failure mode. Handed a key that is not in the dictionary it returns the
 * key — client/src/i18n/index.tsx's `resolve` falls back to the path it was given — so a
 * deleted or mistyped key does not throw, does not warn, and does not render blank. It
 * renders the literal text `placeholder.email` into the page, and the first person to
 * find out is a customer looking at a form hint that reads like a variable name.
 *
 * The two i18n guards that already exist cannot see this. i18n-parity compares en against
 * ar, so it stays green when BOTH dictionaries lose the same block — which is exactly what
 * happened to `placeholder`, missing from both while eight components still called
 * `t("placeholder.email")` and friends. i18n-inline-copy looks for bare string literals in
 * JSX, and a `t()` call is not one. The gap between them is the whole of this file: does
 * the key a component asks for actually exist?
 *
 * Resolving to an OBJECT counts as missing. `t("booking")` where `booking` is a block of
 * twenty keys is not a partial success — `resolve` requires a string and returns the path
 * for anything else, so it renders "booking" the same as a key that was never there.
 */

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/**
 * Blank out comments, preserving every newline so reported line numbers stay true.
 *
 * Not cosmetic: this codebase explains itself in prose, and several of those comments
 * quote `t("booking.title")` while discussing it. Matching the raw text would report
 * those as missing keys and the guard would be untrustworthy from its first run. Strings
 * are tracked so that a "https://…" inside one is not mistaken for a line comment.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * A call to `t` and not to something merely ending in one — `assert(`, `expect(`,
 * `parseInt(` all end in `t`, so the lookbehind rejects an identifier character or a dot
 * immediately before it.
 */
const T_CALL = /(?<![A-Za-z0-9_$.])t\(\s*/g;

interface StaticKey {
  key: string;
  where: string;
}

function collect() {
  const staticKeys: StaticKey[] = [];
  const dynamic: string[] = [];

  for (const file of sourceFiles("client/src")) {
    const src = stripComments(readFileSync(file, "utf8"));
    const lineOf = (index: number) => src.slice(0, index).split("\n").length;
    const where = (index: number) => `${file.replace(/\\/g, "/")}:${lineOf(index)}`;

    T_CALL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = T_CALL.exec(src))) {
      const at = m.index + m[0].length;
      const opener = src[at];

      // `t()` with no argument at all — nothing to check.
      if (opener === ")") continue;

      if (opener === '"' || opener === "'") {
        const end = src.indexOf(opener, at + 1);
        if (end === -1) continue;
        staticKeys.push({ key: src.slice(at + 1, end), where: where(m.index) });
        continue;
      }

      if (opener === "`") {
        const end = src.indexOf("`", at + 1);
        const body = end === -1 ? "" : src.slice(at + 1, end);
        // A template literal with no interpolation is still a static key.
        if (end !== -1 && !body.includes("${")) {
          staticKeys.push({ key: body, where: where(m.index) });
        } else {
          dynamic.push(where(m.index));
        }
        continue;
      }

      // t(someVariable) — the key is not knowable from the source.
      dynamic.push(where(m.index));
    }
  }
  return { staticKeys, dynamic };
}

/** Walk a dotted path the way client/src/i18n/index.tsx does. */
function resolve(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en);
}

describe("every t() key exists in the dictionary", () => {
  const { staticKeys, dynamic } = collect();

  it("found the t() calls at all (the check is not passing on an empty list)", () => {
    // A refactor that renames `t` or moves the components would otherwise leave this
    // file green while checking nothing.
    expect(staticKeys.length).toBeGreaterThan(300);
  });

  it("resolves every statically-written key to a string", () => {
    const missing = staticKeys
      .filter(({ key }) => typeof resolve(key) !== "string")
      .map(({ key, where }) => {
        const found = resolve(key);
        const why = found === undefined ? "missing" : `resolves to ${typeof found}, not a string`;
        return `${where} — t("${key}") ${why}`;
      });

    expect(
      // Sorted so a multi-key failure reads in file order rather than walk order.
      missing.sort(),
      "These keys are absent from client/src/i18n/en.ts — t() would render the dotted path to the customer",
    ).toEqual([]);
  });

  it("has only the known dynamic keys, which cannot be checked statically", () => {
    /*
      Six calls build their key at runtime, so nothing here can confirm the result exists:
      five interpolate — t(`status.${a.status}`), t(`lang.${l}`) — and AssessmentDetail
      passes a variable, t(step.labelKey). The dictionary blocks they index into are
      covered by i18n-parity instead.

      Listed by location rather than counted, because a bare number would let one dynamic
      call be deleted and another added without notice. Adding a seventh is then a
      deliberate act that shows up in a diff rather than a silent widening of the blind
      spot — this list is where you argue the new one is worth its lost coverage.
    */
    expect(dynamic.sort()).toEqual([
      "client/src/components/layout/Navigation.tsx:24",
      "client/src/features/admin/Admin.tsx:286",
      "client/src/features/admin/Admin.tsx:71",
      "client/src/features/admin/Admin.tsx:97",
      "client/src/features/dashboard/AssessmentDetail.tsx:61",
      "client/src/features/dashboard/Dashboard.tsx:188",
    ]);
  });
});
