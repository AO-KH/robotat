import { readdirSync, statSync, renameSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

/**
 * Resize and recompress everything in attached_assets, in place.
 *
 *   npm run assets:optimise
 *
 * These files are imported through `@assets/…`, so they ship to every visitor and are
 * baked into the iOS binary. They arrived straight from a camera and a generator: 13 MB
 * and 8.6 MB for two of them.
 *
 * In place, and keeping the format, so no import path has to change. The originals stay
 * in git history, which is the backup that counts.
 *
 * Keeping the format has one limit worth knowing before you drop a file in here: PNG is
 * lossless, so a photograph saved as one cannot be compressed to a sane weight. The two
 * that arrived that way were converted to JPEG by hand as part of this commit, because
 * quantising them far enough to fit posterised the grass into flat green blocks. This
 * script will not do that conversion for you — it would silently break the `@assets/…`
 * import that names the old extension — but it does say so when it sees the case.
 *
 * Idempotent: an already-processed file is smaller than the threshold and left alone, so
 * running twice does not degrade quality twice.
 */

/** Wide enough for a full-bleed hero on a 2x desktop display; far past any phone. */
const MAX_WIDTH = 1920;
const SKIP_UNDER_BYTES = 600 * 1024;
const IMAGE = /\.(png|jpe?g)$/i;

async function main(): Promise<void> {
  const dir = path.resolve(process.cwd(), "attached_assets");
  const files = readdirSync(dir).filter((f) => IMAGE.test(f));

  let saved = 0;
  const stillHeavy: string[] = [];

  for (const file of files) {
    const full = path.join(dir, file);
    const before = statSync(full).size;

    if (before <= SKIP_UNDER_BYTES) {
      console.log(`skip  ${file} (${Math.round(before / 1024)} KB, already small)`);
      continue;
    }

    const isPng = /\.png$/i.test(file);
    // Write to a temp name first: sharp cannot read and write the same path in one pass.
    const tmp = `${full}.tmp`;

    const pipeline = sharp(full).rotate().resize({
      width: MAX_WIDTH,
      withoutEnlargement: true,
    });

    await (isPng
      ? pipeline.png({ compressionLevel: 9, palette: true }).toFile(tmp)
      : pipeline.jpeg({ quality: 80, mozjpeg: true }).toFile(tmp));

    const after = statSync(tmp).size;
    renameSync(tmp, full);
    saved += before - after;
    console.log(
      `wrote ${file}: ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`,
    );

    if (after > SKIP_UNDER_BYTES) stillHeavy.push(file);
  }

  console.log(`\nsaved ${Math.round(saved / 1024 / 1024)} MB`);

  if (stillHeavy.length) {
    console.log(
      [
        "",
        "Still over 600 KB, so test/asset-weight.test.ts will fail on:",
        ...stillHeavy.map((f) => `  ${f}`),
        "",
        "Re-running will not help — that is as small as this format goes at 1920px. If it",
        "is a photograph in a PNG, save it as JPEG, delete the PNG, and change the one",
        "`@assets/…` import that names it. If it needs transparency, crop it smaller.",
      ].join("\n"),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
