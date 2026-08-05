import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Touch targets need 44×44 (Apple HIG, and the mobile-app-ui-design skill this plan
 * applies). This is a source scan, so it catches the common regression — a control
 * declared with a fixed height below the floor — not every possible layout outcome.
 * Measuring the rendered box needs a browser; see the plan's Task 5 Step 1 for that.
 */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const VENDOR = /client[\\/]src[\\/]components[\\/]ui[\\/]/;

describe("touch targets", () => {
  it("declares no interactive element shorter than 44px", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles("client/src")) {
      if (VENDOR.test(file)) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        const m = line.match(/\b(?:min-)?h-\[(\d+)px\]/);
        if (m && Number(m[1]) < 44 && /<(button|a|input)\b/.test(line)) {
          offenders.push(`${file.replace(/\\/g, "/")}:${i + 1} (${m[0]})`);
        }
      });
    }
    expect(offenders, "Touch targets need at least 44px — Apple HIG").toEqual([]);
  });
});
