import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { MAX_BYTES, SHIPPED_IMAGE } from "../script/asset-budget";

/**
 * Nothing shipped to a phone should be this heavy.
 *
 * An image here that a module imports through `@assets/…` is bundled by Vite and lands in
 * the client bundle, which is also what gets baked into the iOS binary. Not everything in
 * the directory is imported — the PDF, the .txt files and one stray PNG are not, and Vite
 * copies nothing wholesale — but the ones that were imported included a 13 MB JPEG and an
 * 8.6 MB PNG, and on a farm on 3G the hero image alone was minutes.
 *
 * Every image is checked rather than only the imported ones, because whether a file is
 * imported changes with a single line, and the weight is the part worth being strict
 * about. The budget and the extension list come from script/asset-budget.ts, shared with
 * the optimiser so this cannot demand something that tool will not do.
 */
const LIMIT_KB = Math.round(MAX_BYTES / 1024);

describe("shipped assets", () => {
  const dir = path.resolve(__dirname, "..", "attached_assets");
  const images = readdirSync(dir).filter((f) => SHIPPED_IMAGE.test(f));

  it("has images to check (the guard is not silently passing on an empty list)", () => {
    expect(images.length).toBeGreaterThan(0);
  });

  it.each(images)(`%s is under ${LIMIT_KB} KB`, (file) => {
    const bytes = statSync(path.join(dir, file)).size;
    expect(bytes, `${file} is ${Math.round(bytes / 1024)} KB — run npm run assets:optimise`).toBeLessThanOrEqual(
      MAX_BYTES,
    );
  });
});
