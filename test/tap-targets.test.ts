import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Touch targets need 44×44 (Apple HIG). This is a source scan of *declared* heights, so
 * be clear up front about the half of the problem it cannot see:
 *
 *   IT WILL NEVER CATCH A PADDING-DERIVED HEIGHT. `py-2.5` over `text-label` measures
 *   38.8px and nothing in this file can know that — the number only exists after
 *   layout, out of the font metrics of the rendered text. The header's "BOOK A DEMO"
 *   button shipped under the floor for exactly that reason, and no source rule could
 *   have stopped it.
 *
 * So a green run here means "nobody typed a too-small height", NOT "every target clears
 * 44". THE BROWSER SWEEP IS THE REAL CHECK: at 375, 640, 768 and 1024px, in both
 * languages, walk every button/a/input/select and assert `getBoundingClientRect()` is
 * at least 44 on both axes. Controls hidden below a breakpoint (`hidden sm:flex` and
 * friends) do not exist at 375px, so the sweep has to run at the widths where they
 * appear or it misses them the same way the 375px audit did.
 *
 * What this file does catch is the typo-level regression, in both spellings:
 *   - arbitrary values — `h-[32px]`, `min-h-[40px]`
 *   - the Tailwind numeric scale — `h-0` … `h-10` (0–40px). `h-11` is 44px and passes.
 *
 * It scans each file as ONE STRING, not line by line. The line-by-line version only
 * matched when the tag and its classes shared a line, which is not how this codebase
 * formats JSX — almost every element here puts `className` on its own line, so the old
 * guard passed everything put in front of it. Line numbers are derived from the
 * character offset, the same way test/no-hidden-content.test.ts does it.
 */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** shadcn/ui primitives are vendored upstream code; we do not hand-tune their sizing. */
const VENDOR = /client[\\/]src[\\/]components[\\/]ui[\\/]/;

const INTERACTIVE = /<(?:button|a|input|select|textarea)\b/g;

/**
 * Index just past the `>` that closes the opening tag starting at `start`. A plain
 * `[^>]*>` would stop at the first `>` of an `onClick={() => …}` handler and miss every
 * class after it, so this walks the tag tracking brace depth and only accepts a `>` at
 * depth 0 — the same technique as spanEnd() in test/no-hidden-content.test.ts.
 */
function tagEnd(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return i + 1;
  }
  return src.length;
}

/**
 * `h-8`, `h-[32px]`, `min-h-[44px]`, `sm:h-10`. The lookbehind rejects `max-h-…`, which
 * caps a scroll area rather than sizing a target; the lookahead rejects fractions like
 * `h-1/2`, where the leading digit says nothing about the rendered height.
 */
const HEIGHT = /(?<![\w-])(?:min-)?h-(?:\[(\d+)px\]|(\d+(?:\.5)?))(?![\w./[-])/g;

/** Tailwind's spacing scale is 0.25rem — 4px — per step. */
const STEP_PX = 4;

const GUIDANCE = `
Touch targets need at least 44×44 — Apple HIG, and the rule this branch applies.

The elements below declare a height under 44px. Give them \`min-h-[44px]\` (plus
\`flex items-center\` / \`inline-flex items-center justify-center\` if the content needs
re-centring afterwards) rather than trimming padding to fit.

Remember this guard only sees heights that are WRITTEN DOWN. A control sized purely by
its padding can still sit under the floor with this test green — measure in the browser
at 375/640/768/1024px, in both languages, before believing otherwise.

Offending locations:`;

describe("touch targets", () => {
  it("declares no interactive element shorter than 44px", () => {
    const offenders: string[] = [];

    for (const file of tsxFiles("client/src")) {
      if (VENDOR.test(file)) continue;
      const src = readFileSync(file, "utf8");

      for (const el of src.matchAll(INTERACTIVE)) {
        const tag = src.slice(el.index, tagEnd(src, el.index));

        for (const h of tag.matchAll(HEIGHT)) {
          const px = h[1] !== undefined ? Number(h[1]) : Number(h[2]) * STEP_PX;
          if (px >= 44) continue;

          const line = src.slice(0, el.index).split("\n").length;
          offenders.push(`${file.replace(/\\/g, "/")}:${line} (${h[0]} = ${px}px)`);
        }
      }
    }

    expect(offenders, GUIDANCE).toEqual([]);
  });
});
