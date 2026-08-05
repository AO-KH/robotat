import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Content must be in the DOM AND visible at first paint. A reveal that depends on
 * IntersectionObserver or a mount animation firing will strand content invisible
 * whenever it does not fire — a backgrounded tab, a crawler, print, reduced motion,
 * a hydration hiccup. Animate `y`, never `opacity` from 0.
 *
 * Overlays (modals, the mobile menu) are the one legitimate exception: they start
 * closed by design and are gated by AnimatePresence, not by a scroll position. Mark
 * those lines with `overlay-ok` so the exemption is explicit and reviewable.
 *
 * This scans *spans*, not lines: it finds each `initial={{`, walks forward tracking
 * brace depth to the matching close, and tests the whole span. A reformat that
 * spreads the prop across several lines therefore cannot evade the guard, while a
 * legitimate partial fade like `opacity: 0.5` still passes.
 */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/**
 * Given the index of the first `{` of an `initial={{` prop, return the index just
 * past its matching close. Tracks depth, so a nested object closes correctly rather
 * than the first `}}` ending the span early.
 */
function spanEnd(src: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return src.length;
}

/**
 * Starts fully transparent. `opacity: 0.5` is a partial fade, not hidden content, so
 * the lookahead lets it through — but it must still catch `0.0` and `0.00`, which are
 * spelled differently and hide just as completely. Hence `\d*[1-9]`: exempt only when
 * some non-zero digit follows the decimal point.
 */
const HIDDEN = /opacity:\s*0(?!\.\d*[1-9])/;

const GUIDANCE = `
Content listed below starts at opacity 0, so it is invisible until an animation runs.
If that animation never fires — backgrounded tab, crawler, print, reduced motion, a
hydration hiccup — the content sits in the DOM permanently unreadable.

Fix it by animating position only, via the shared variants in client/src/lib/motion.ts:
  scroll-triggered   <motion.div {...riseIn}>
  mount-triggered    <motion.div {...riseOnMount}>
Preserve any stagger by merging rather than dropping the shared transition:
  <motion.div {...riseIn} transition={{ ...riseIn.transition, delay: i * 0.1 }}>

If this really IS an overlay — a modal or menu inside <AnimatePresence>, gated by an
open/closed boolean rather than by scroll position — it may keep opacity: 0. Mark it
with an \`overlay-ok\` comment on the initial={{ line, the line above it, or any line
inside the prop, so the exemption stays explicit and reviewable.

Offending locations (file:line of the initial={{ prop):`;

describe("content is visible by default", () => {
  it("no component starts content at opacity 0", () => {
    const offenders: string[] = [];

    for (const file of tsxFiles("client/src")) {
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n");

      for (const m of src.matchAll(/initial=\{\{/g)) {
        const braceStart = m.index + "initial=".length;
        const span = src.slice(braceStart, spanEnd(src, braceStart));
        if (!HIDDEN.test(span)) continue;

        // 1-based line of the `initial={{`, plus the last line the span covers.
        const startLine = src.slice(0, m.index).split("\n").length;
        const endLine = startLine + span.split("\n").length - 1;

        // Exempt if `overlay-ok` sits on the line above, the opening line, or any
        // line inside the span — so a multi-line overlay prop is markable too.
        const scope = lines.slice(Math.max(0, startLine - 2), endLine);
        if (scope.some((l) => l.includes("overlay-ok"))) continue;

        offenders.push(`${file.replace(/\\/g, "/")}:${startLine}`);
      }
    }

    expect(offenders, GUIDANCE).toEqual([]);
  });
});
