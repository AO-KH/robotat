import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  ASSET_DIRS,
  MAX_BYTES,
  TOTAL_MAX_BYTES,
  overBudgetAdvice,
  shippedImages,
} from "../script/asset-budget";

/**
 * Nothing shipped to a phone should be this heavy.
 *
 * An image in attached_assets that a module imports through `@assets/…` is bundled by Vite
 * and lands in the client bundle, which is also what gets baked into the iOS binary. One in
 * client/public needs no import at all — Vite's root is `client`, so that is publicDir and
 * it is copied into the build verbatim. Not everything in attached_assets is imported, but
 * every image in both places is weighed anyway: whether a file is imported changes with a
 * single line, and the weight is the part worth being strict about.
 *
 * The ones that were imported once included a 13 MB JPEG and an 8.6 MB PNG, and on a farm
 * on 3G the hero image alone was minutes.
 *
 * Two budgets, because they fail differently. The per-file one catches the original nobody
 * processed. The total catches what it structurally cannot see — ten files at 599 KB each
 * are six megabytes of green ticks. Both come from script/asset-budget.ts, shared with the
 * optimiser so this cannot demand something that tool will not do.
 */
const LIMIT_KB = Math.round(MAX_BYTES / 1024);
const TOTAL_LIMIT_KB = Math.round(TOTAL_MAX_BYTES / 1024);
const kb = (bytes: number): number => Math.round(bytes / 1024);

describe("shipped assets", () => {
  const images = shippedImages(path.resolve(__dirname, ".."));

  it(`has images to check in each of ${ASSET_DIRS.join(", ")}`, () => {
    // Per directory, not in total: a walk that quietly stopped finding client/public
    // would otherwise still be covered by the dozen files in attached_assets.
    for (const dir of ASSET_DIRS) {
      const prefix = dir.replace(/\\/g, "/") + "/";
      expect(
        images.filter((i) => i.name.startsWith(prefix)).length,
        `no images found under ${prefix} — the guard is scanning nothing there`,
      ).toBeGreaterThan(0);
    }
  });

  it.each(images)(`$name is under ${LIMIT_KB} KB`, ({ name, bytes }) => {
    expect(bytes, `${name} is ${kb(bytes)} KB — ${overBudgetAdvice(name)}`).toBeLessThanOrEqual(MAX_BYTES);
  });

  it(`weighs under ${TOTAL_LIMIT_KB} KB in total`, () => {
    const total = images.reduce((sum, i) => sum + i.bytes, 0);
    const heaviest = [...images]
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5)
      .map((i) => `  ${kb(i.bytes)} KB  ${i.name}`)
      .join("\n");

    expect(
      total,
      `${images.length} images weigh ${kb(total)} KB together, over the ${TOTAL_LIMIT_KB} KB ` +
        `budget. Every one of them may be individually fine; the total is not. Heaviest:\n${heaviest}`,
    ).toBeLessThanOrEqual(TOTAL_MAX_BYTES);
  });
});
