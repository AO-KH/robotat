import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Type comes from a closed set of roles — text-display / text-heading / text-subhead /
 * text-body / text-label, defined in client/src/index.css. Before this the app had 28
 * distinct sizes, so nothing was dependably bigger than anything else and every new
 * screen invented its own. An arbitrary `text-[19px]` is how that comes back.
 */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** shadcn primitives this app never renders — not worth churning. */
const VENDOR = /client[\\/]src[\\/]components[\\/]ui[\\/]/;

describe("typography uses the named role scale", () => {
  it("declares no arbitrary font size", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles("client/src")) {
      if (VENDOR.test(file)) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        // `text-[…]` carrying a length. Colours like text-[#c084fc] are not sizes.
        if (/\btext-\[[0-9.]+(px|rem|em)\]/.test(line)) {
          offenders.push(`${file.replace(/\\/g, "/")}:${i + 1}`);
        }
      });
    }
    expect(
      offenders,
      "Use text-display / text-heading / text-subhead / text-body / text-label instead",
    ).toEqual([]);
  });

  it("uses only two font weights", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles("client/src")) {
      if (VENDOR.test(file)) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        const m = line.match(/\bfont-(thin|extralight|light|medium|bold|extrabold|black)\b/);
        if (m) offenders.push(`${file.replace(/\\/g, "/")}:${i + 1} (${m[0]})`);
      });
    }
    expect(offenders, "Only font-normal and font-semibold are allowed").toEqual([]);
  });
});
