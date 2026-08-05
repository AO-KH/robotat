/**
 * Shared motion variants.
 *
 * Nothing here animates opacity from 0. Content is visible at first paint and motion
 * only moves it — so if the animation never runs, the page still reads correctly.
 * Previously almost everything below the fold on Home, Fleet and Services was
 * `opacity: 0` until IntersectionObserver fired.
 *
 * `MotionConfig reducedMotion="user"` in App.tsx makes framer-motion drop the
 * transform entirely for anyone with Reduce Motion on — which iOS exposes as an
 * accessibility setting, and this client is bundled into the iOS app.
 */

/** Settles into place as it scrolls into view. */
export const riseIn = {
  initial: { y: 16 },
  whileInView: { y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
} as const;

/** Settles into place on mount. For above-the-fold content. */
export const riseOnMount = {
  initial: { y: 16 },
  animate: { y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
} as const;
