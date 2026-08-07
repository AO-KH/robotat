import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Nothing shipped to a phone should be this heavy.
 *
 * Every file here is imported through `@assets/…` and lands in the client bundle, which
 * is also what gets baked into the iOS binary. Before this guard the directory held a
 * 13 MB JPEG and an 8.6 MB PNG — on a farm on 3G, the hero image alone was minutes.
 *
 * 600 KB is generous for a full-width photograph at 1920px and quality 80. It is chosen
 * to fail loudly on an un-processed original rather than to shave the last few bytes.
 */
const MAX_BYTES = 600 * 1024;
const IMAGE = /\.(png|jpe?g|webp|gif)$/i;

describe("shipped assets", () => {
  const dir = path.resolve(__dirname, "..", "attached_assets");
  const images = readdirSync(dir).filter((f) => IMAGE.test(f));

  it("has images to check (the guard is not silently passing on an empty list)", () => {
    expect(images.length).toBeGreaterThan(0);
  });

  it.each(images)("%s is under 600 KB", (file) => {
    const bytes = statSync(path.join(dir, file)).size;
    expect(bytes, `${file} is ${Math.round(bytes / 1024)} KB — run npm run assets:optimise`).toBeLessThanOrEqual(
      MAX_BYTES,
    );
  });
});
