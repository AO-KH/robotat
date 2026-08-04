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
 */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("content is visible by default", () => {
  it("no component starts content at opacity 0", () => {
    const offenders: string[] = [];

    for (const file of tsxFiles("client/src")) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/initial=\{\{[^}]*opacity:\s*0/.test(line)) return;
        const exempt = /overlay-ok/.test(line) || /overlay-ok/.test(lines[i - 1] ?? "");
        if (!exempt) offenders.push(`${file.replace(/\\/g, "/")}:${i + 1}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
