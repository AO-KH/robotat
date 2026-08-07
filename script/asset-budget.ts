/**
 * The weight budget for the images in attached_assets, shared by the optimiser that
 * enforces it and the test that guards it.
 *
 * They were two separate literals for one commit and had already drifted: the guard
 * accepted `.webp` and `.gif`, the optimiser opened neither. A heavy one of those would
 * have failed the test with a message telling the operator to run a script that silently
 * skipped it. Whichever of the two you are editing, the other one needs to agree.
 */

/**
 * Generous for a full-width photograph at 1920px and quality 80 — chosen to fail loudly
 * on an original nobody processed, not to shave the last few bytes off a good one.
 */
export const MAX_BYTES = 600 * 1024;

/** What a browser renders, and therefore what someone will eventually drop in here. */
export const SHIPPED_IMAGE = /\.(png|jpe?g|webp|gif)$/i;

/**
 * The subset the optimiser re-encodes. GIF is deliberately outside it: resizing one means
 * deciding what to do about its frames, and anything heavy enough to matter here is a
 * photograph, which should never have been a GIF. The optimiser names the file and says
 * so rather than passing over it in silence.
 */
export const RE_ENCODABLE = /\.(png|jpe?g|webp)$/i;
