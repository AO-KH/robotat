import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * The weight budget for the images this app ships, shared by the optimiser that enforces
 * it and the test that guards it.
 *
 * They were two separate literals for one commit and had already drifted: the guard
 * accepted `.webp` and `.gif`, the optimiser opened neither. A heavy one of those would
 * have failed the test with a message telling the operator to run a script that silently
 * skipped it. The directory walk, the extension list, the budget and the advice printed
 * on a failure all live here now for that reason — the two callers cannot disagree about
 * something they do not each define.
 */

/**
 * Generous for a full-width photograph at 1920px and quality 80 — chosen to fail loudly
 * on an original nobody processed, not to shave the last few bytes off a good one.
 */
export const MAX_BYTES = 600 * 1024;

/**
 * A ceiling on all of them together, because the per-file one cannot see accumulation.
 *
 * Ten files at 599 KB pass the per-file check individually and ship six megabytes. The
 * 30 MB incident this guard was built after happened to be one enormous JPEG, so a
 * per-file limit caught it; the next one will more likely be a year of product photos
 * arriving one commit at a time, each of them individually reasonable.
 *
 * Three megabytes against the 2.2 MB in the tree today. That is roughly one more hero
 * photograph of room — enough that adding an image is not a negotiation, tight enough
 * that adding ten is. The unit that matters is time, not bytes: a rural Saudi 3G link
 * moves something like 50 KB a second, so three megabytes of imagery is already about a
 * minute of staring at a page, and this app's customers are on farms.
 */
export const TOTAL_MAX_BYTES = 3 * 1024 * 1024;

/**
 * Where images reach a browser from, and therefore what has to be weighed.
 *
 * `attached_assets` ships whatever a module imports through `@assets/…`, bundled by Vite
 * and baked into the iOS binary with it. `client/public` is Vite's publicDir (its root is
 * `client`), which is copied into the build verbatim — no import required, no bundler
 * involved, which is exactly why it went unwatched: an image can land there and ship
 * without any code referencing it.
 */
export const ASSET_DIRS = ["attached_assets", path.join("client", "public")];

/**
 * What a browser renders, and therefore what someone will eventually drop in here.
 *
 * SVG is in the list despite being text. A base64 raster pasted into one is a normal
 * export from several design tools and a well-known way to carry megabytes past a check
 * that only looks at photograph extensions.
 */
export const SHIPPED_IMAGE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

/**
 * The subset the optimiser re-encodes.
 *
 * GIF is deliberately outside it: resizing one means deciding what to do about its
 * frames, and anything heavy enough to matter here is a photograph, which should never
 * have been a GIF. SVG is outside it because it cannot be inside it — sharp rasterises
 * SVG input but emits no SVG, so "optimising" one would mean silently replacing vector
 * artwork with a PNG under its old name.
 *
 * Both cases still fail the budget. They fail with overBudgetAdvice() instead of a
 * pointer at a script that would pass over them.
 */
export const RE_ENCODABLE = /\.(png|jpe?g|webp|avif)$/i;

export interface ShippedImage {
  /** Repo-relative, forward-slashed, so a failure message reads the same on either OS. */
  name: string;
  full: string;
  bytes: number;
}

/** Every shipped image under ASSET_DIRS, recursively, relative to `root`. */
export function shippedImages(root: string): ShippedImage[] {
  const out: ShippedImage[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (SHIPPED_IMAGE.test(entry)) {
        out.push({
          name: path.relative(root, full).replace(/\\/g, "/"),
          full,
          bytes: statSync(full).size,
        });
      }
    }
  };

  for (const dir of ASSET_DIRS) walk(path.resolve(root, dir));
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** What to actually do about an over-budget file, which depends on what it is. */
export function overBudgetAdvice(name: string): string {
  if (RE_ENCODABLE.test(name)) return "run npm run assets:optimise";
  if (/\.svg$/i.test(name)) {
    return (
      "an SVG cannot be re-encoded in place, so npm run assets:optimise will not touch it. " +
      "An SVG this heavy is almost always carrying a base64 raster in a data: URI — pull " +
      "that out into a real image file and reference it, or drop it"
    );
  }
  return (
    "npm run assets:optimise does not open this format. Convert it to JPEG or PNG — or, " +
    "if it is animated, to a video — and change the import that names it"
  );
}
