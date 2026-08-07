import { readdirSync, statSync, renameSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { MAX_BYTES, RE_ENCODABLE, SHIPPED_IMAGE } from "./asset-budget";

/**
 * Resize and recompress the images in attached_assets, in place.
 *
 *   npm run assets:optimise
 *
 * An image here that some module imports through `@assets/…` is bundled by Vite and so is
 * also baked into the iOS binary. Not all of them are: Vite's root is `client`, so
 * `publicDir` is client/public and nothing in attached_assets ships unless it is imported
 * — the PDF, the three .txt files and image_…391.png are along for the ride. Two of the
 * ones that do ship arrived straight from a camera and a generator, at 13 MB and 8.6 MB.
 *
 * In place and keeping each file's format, so no import path has to move; the originals
 * stay in git history, which is the backup that counts. Keeping the format has one limit
 * worth knowing before you drop a file in here: PNG is lossless, so a photograph saved as
 * one cannot be squeezed to a sane weight. The two that arrived that way were converted
 * to JPEG by hand in the commit that added this script, because quantising them far
 * enough to fit posterised the grass into flat green blocks. This script will not do that
 * conversion for you — renaming a file out from under an import fails at build time
 * rather than where the mistake was made — but it does say so when it meets the case.
 *
 * Safe to run repeatedly, which takes two rules and not one. A file already under budget
 * is never opened. A file over it is written back only if the re-encode is at least a
 * tenth smaller, because re-encoding a JPEG that cannot reach the budget claws back about
 * four percent a pass and loses a little quality every time — and running it again is
 * exactly what someone does while staring at a red guard test.
 */

/** Wide enough for a full-bleed hero on a 2x desktop display; far past any phone. */
const MAX_WIDTH = 1920;

/** Below this much shrinkage, the pass is costing more quality than it is buying bytes. */
const MIN_GAIN = 0.1;

async function main(): Promise<void> {
  const dir = path.resolve(process.cwd(), "attached_assets");
  const files = readdirSync(dir).filter((f) => SHIPPED_IMAGE.test(f));

  let saved = 0;
  const stillHeavy: string[] = [];
  const unhandled: string[] = [];

  for (const file of files) {
    const full = path.join(dir, file);
    const before = statSync(full).size;

    if (before <= MAX_BYTES) {
      console.log(`skip  ${file} (${kb(before)} KB, already small)`);
      continue;
    }

    if (!RE_ENCODABLE.test(file)) {
      console.log(`stuck ${file} (${kb(before)} KB, not a format this script re-encodes)`);
      unhandled.push(file);
      continue;
    }

    const encoded = await encode(full, file);
    const after = encoded.length;

    if (after > before * (1 - MIN_GAIN)) {
      console.log(
        `leave ${file} (${kb(before)} KB; another pass would save ${Math.round(
          (1 - after / before) * 100,
        )}% and cost quality)`,
      );
      stillHeavy.push(file);
      continue;
    }

    replace(full, encoded);
    saved += before - after;
    console.log(`wrote ${file}: ${kb(before)} KB -> ${kb(after)} KB`);

    if (after > MAX_BYTES) stillHeavy.push(file);
  }

  console.log(`\nsaved ${saved >= 1024 * 1024 ? `${(saved / 1024 / 1024).toFixed(1)} MB` : `${kb(saved)} KB`}`);

  if (stillHeavy.length) {
    console.log(
      [
        "",
        `Over the ${kb(MAX_BYTES)} KB budget, so test/asset-weight.test.ts will fail on:`,
        ...stillHeavy.map((f) => `  ${f}`),
        "",
        "Running this again will not fix them: a second pass is refused unless it would save",
        "a tenth, and it will not. If it is a photograph in a PNG, save it as JPEG, delete the",
        "PNG and change the one `@assets/…` import that names it. If it needs transparency,",
        "crop it smaller.",
      ].join("\n"),
    );
  }

  if (unhandled.length) {
    console.log(
      [
        "",
        "Over budget and in a format this script does not open:",
        ...unhandled.map((f) => `  ${f}`),
        "",
        "See script/asset-budget.ts for why. Convert it to JPEG or PNG — or, if it is animated,",
        "to a video — and change the import that names it.",
      ].join("\n"),
    );
  }
}

async function encode(full: string, file: string): Promise<Buffer> {
  const pipeline = sharp(full)
    // Applies the EXIF orientation before the metadata is dropped, so a photo taken
    // sideways does not silently flip.
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    // Carries the input's colour profile across if it has one. Nothing here does today,
    // so this costs zero bytes; a Display-P3 photo off an iPhone would render desaturated
    // without it. It is keepIccProfile and not withIccProfile("srgb") on purpose —
    // measured, the latter attaches an sRGB profile without converting the pixels, which
    // is the same bug wearing a label claiming it is fixed.
    .keepIccProfile();

  if (/\.png$/i.test(file)) return pipeline.png({ compressionLevel: 9, palette: true }).toBuffer();
  if (/\.webp$/i.test(file)) return pipeline.webp({ quality: 80 }).toBuffer();
  return pipeline.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
}

/**
 * Swap the file's contents for the encoded ones through a temp name, so an interruption
 * leaves either the old image or the new one and never half of either. The finally clears
 * the temp file up on the paths where the rename never happened — a full disk, or Windows
 * refusing to replace a file something else has open.
 */
function replace(full: string, bytes: Buffer): void {
  const tmp = `${full}.tmp`;
  try {
    writeFileSync(tmp, bytes);
    renameSync(tmp, full);
  } finally {
    rmSync(tmp, { force: true });
  }
}

const kb = (bytes: number): number => Math.round(bytes / 1024);

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
