# Design De-slop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the generated-looking tells from ROBOTAT's UI and unify it onto one surface language, without changing the purple theme.

**Architecture:** Three phases. First fix a real bug — most of the site currently renders at `opacity: 0` until IntersectionObserver fires. Then collapse two competing surface languages into one built on tonal elevation rather than blur, which also removes a WKWebView scroll cost since this same client is bundled into the iOS app. Finally recompose the pieces whose shape is the tell: the three-line hero with a dangling accent word, the inverted section heads, and the filled-plus-outlined button pair.

**Tech Stack:** React 18, Vite, Tailwind, framer-motion, Vitest (node environment).

---

## Non-negotiable constraints

**The purple theme stays.** `client/src/index.css:12-42` is NASL's brand, matched to nasl-tech.com. The anti-slop law calls purple a tell; it also says a specific user instruction overrides its defaults, and this is one. **No task in this plan changes a hue.** What changes is how the accent is *applied* — tonal steps instead of one saturated swatch on every element.

**Do not do the mechanical hex→token sweep.** There are 75+ hardcoded purple literals (`#c084fc` × 42, `#a855f7` × 33) alongside tokens holding identical values. Replacing them changes nothing visible, touches 17 files, and risks conflicting with the composition work. Deliberately out of scope.

**The typeface is parked.** `--font-sans` names `'Effra'` first with no `@font-face` and no font file, so all Latin text silently renders in IBM Plex Sans Arabic. The only Effra file on the machine is a single **desktop-licensed Bold TTF**, and the design uses five weights (`font-medium` × 81, `font-bold` × 38, `font-semibold` × 27, plus normal and light). Web embedding needs a separate Dalton Maag licence. Task 8 makes the stack honest and structures it so a licensed family drops in as a one-line change later. **No task converts or ships that TTF.**

---

## File Structure

| File | Responsibility |
| --- | --- |
| `client/src/lib/motion.ts` (create) | The only place motion variants are defined. Nothing here animates opacity from 0. |
| `test/no-hidden-content.test.ts` (create) | Regression guard: fails if any component starts content invisible. |
| `client/src/App.tsx` (modify) | Wrap the tree in `MotionConfig reducedMotion="user"`. |
| `client/src/features/marketing/Home.tsx` (modify) | Remove local `fadeUp`; recompose hero and `SectionHead`; drop the CTA button pair. |
| `client/src/features/marketing/Fleet.tsx`, `Services.tsx` (modify) | Use the shared variants. |
| `client/src/index.css` (modify) | Replace `.glass-card` with `.surface`; delete dead declarations; differentiate label treatments. |
| `client/src/components/layout/BackgroundMesh.tsx` (modify) | Static composed field; no infinite loops. |
| `client/src/i18n/en.ts`, `ar.ts` (modify) | Rewrite headline keys so copy stops existing to serve a colour. |

**Testing note:** `vitest.config.ts` sets `environment: "node"` and `include: ["test/**/*.test.ts"]`. There is no jsdom, so React components cannot be rendered in tests. Task 1's guard is a **source scan**, which is the honest tool available and a genuine regression catch. Everything else is verified in the browser with explicit steps.

---

## Task 1: Stop hiding content behind animations

**Files:**
- Create: `client/src/lib/motion.ts`
- Test: `test/no-hidden-content.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/no-hidden-content.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Content must be in the DOM AND visible at first paint. A reveal that depends on
 * IntersectionObserver or a mount animation firing will strand content invisible
 * whenever it does not fire — a backgrounded tab, a crawler, print, reduced motion,
 * a hydration hiccup. Animate `y`, never `opacity` from 0.
 *
 * Overlays (modals, the mobile menu) are the one legitimate exception: they start
 * closed by design and are gated by AnimatePresence, not by a scroll position. Mark
 * those lines with `overlay-ok` so the exemption is explicit and reviewable.
 */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("content is visible by default", () => {
  it("no component starts content at opacity 0", () => {
    const offenders: string[] = [];

    for (const file of tsxFiles("client/src")) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/initial=\{\{[^}]*opacity:\s*0/.test(line)) return;
        const exempt = /overlay-ok/.test(line) || /overlay-ok/.test(lines[i - 1] ?? "");
        if (!exempt) offenders.push(`${file.replace(/\\/g, "/")}:${i + 1}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails, and record what it catches**

Run: `npx vitest run test/no-hidden-content.test.ts`
Expected: FAIL, listing roughly 20 offenders across `Home.tsx`, `Fleet.tsx`, `Services.tsx`, `Dashboard.tsx`, `Admin.tsx`, `Analytics.tsx`, `Auth.tsx`, `Profile.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `VerifyEmail.tsx`, `AssessmentDetail.tsx`.
Paste the list into your report — it is the inventory for Step 4.

- [ ] **Step 3: Create the shared motion module**

Create `client/src/lib/motion.ts`:

```ts
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
```

- [ ] **Step 4: Replace every offending usage**

For each file the test listed, apply the matching change. Two shapes only:

*Scroll-triggered* — replace the whole props object with a spread:
```tsx
// before
<motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
// after
<motion.div {...riseIn}>
```

*Mount-triggered* — same, with the mount variant:
```tsx
// before
<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
// after
<motion.div {...riseOnMount}>
```

Add `import { riseIn, riseOnMount } from "@/lib/motion";` to each file (import only what it uses).

Where a `transition={{ delay: i * 0.1 }}` exists alongside, keep it as a separate prop after the spread: `<motion.div {...riseIn} transition={{ ...riseIn.transition, delay: i * 0.1 }}>`.

In `Home.tsx`, delete the local `fadeUp` object at lines 12-17 entirely and replace its six `{...fadeUp}` usages with `{...riseIn}`.

For the genuine overlays — `Navigation.tsx` (mobile menu), `Fleet.tsx` (product modal), `BookDemoModal.tsx` — keep `opacity: 0` and add a trailing `// overlay-ok` comment on the same line, because those are AnimatePresence-gated and start closed by design.

- [ ] **Step 5: Add the global reduced-motion config**

In `client/src/App.tsx`, add to the imports:
```tsx
import { MotionConfig } from "framer-motion";
```
Then wrap the existing `<QueryClientProvider client={queryClient}>` contents — put `<MotionConfig reducedMotion="user">` immediately inside `QueryClientProvider` and close it immediately before `</QueryClientProvider>`.

- [ ] **Step 6: Run the test and the full suite**

Run: `npx vitest run test/no-hidden-content.test.ts && npm test && npm run check`
Expected: the guard passes; the full suite passes; typecheck silent.

- [ ] **Step 7: Verify in the browser that motion still reads**

Load `http://localhost:5000/`, scroll the full page, and confirm sections still settle upward as they enter. Then run in the console:
```js
[...document.querySelectorAll('main *')].filter(e => getComputedStyle(e).opacity === '0').length
```
Expected: `0`.

- [ ] **Step 8: Commit**

```bash
git add client/src/lib/motion.ts test/no-hidden-content.test.ts client/src/App.tsx client/src
git commit -m "fix(ui): never gate content visibility on an animation"
```

---

## Task 2: One surface language, built on tone not blur

**Files:**
- Modify: `client/src/index.css:97-99`
- Modify: every file using `glass-card` (23 call sites across 13 files)

- [ ] **Step 1: Replace the utility**

In `client/src/index.css`, replace lines 97-99:

```css
  .glass-card {
    @apply bg-card/60 backdrop-blur-xl border border-white/5 shadow-xl;
  }
```

with:

```css
  /* Tonal elevation. A surface reads as raised because its value is lifted off the
     page and its top edge catches light — not because it is blurred and shadowed.
     Two reasons over the old glass: backdrop-filter on 23 surfaces is a real scroll
     cost in the iOS WKWebView this client is bundled into, and glass over a flat
     dark field has nothing behind it to refract, which is the botched-glass case.
     The edge is the brand purple at low opacity, so it belongs to the theme rather
     than being a generic white hairline. */
  .surface {
    background-color: hsl(var(--card) / 0.72);
    border: 1px solid hsl(var(--purple) / 0.10);
    box-shadow: inset 0 1px 0 0 hsl(var(--foreground) / 0.04);
  }
```

- [ ] **Step 2: Rename every call site**

Replace `glass-card` with `surface` everywhere in `client/src`. Nine files apply the border twice — `glass-card rounded-3xl border border-white/10` — because `glass-card` already carried one. Drop the redundant `border border-white/10` in those cases so the class supplies the only edge.

Affected files (13): `Navigation.tsx`, `Auth.tsx`, `ResetPassword.tsx`, `ForgotPassword.tsx`, `VerifyEmail.tsx`, `Profile.tsx`, `AssessmentDetail.tsx`, `Analytics.tsx`, `Dashboard.tsx`, `Admin.tsx`, `Fleet.tsx`, `Services.tsx`, `Home.tsx`. Work from the grep in Step 3 rather than assuming a count per file.

- [ ] **Step 3: Confirm the old name is gone**

Run: `grep -rn "glass-card" client/src | wc -l`
Expected: `0`.

Run: `grep -rn "backdrop-blur" client/src | wc -l`
Expected: `5`. Those five are the mobile-menu scrim and panel (`Navigation.tsx:135`, `:142`), the booking-modal scrim (`BookDemoModal.tsx:88`), and the Fleet modal scrim and close button (`Fleet.tsx:137`, `:155`). All five sit over live page content, so there is something real to blur — they stay.

- [ ] **Step 4: Typecheck and test**

Run: `npm run check && npm test`
Expected: both clean.

- [ ] **Step 5: Verify in the browser**

Load `/dashboard` (sign in first), `/fleet`, and `/auth`. Cards should still read as distinct raised panels. Take a screenshot of `/fleet` and confirm the product cards have a visible edge and do not look flat against the page.

- [ ] **Step 6: Commit**

```bash
git add client/src
git commit -m "refactor(ui): replace glass cards with tonal surfaces"
```

---

## Task 3: A background that does not run forever

**Files:**
- Modify: `client/src/components/layout/BackgroundMesh.tsx`

- [ ] **Step 1: Replace the component**

`BackgroundMesh` currently stacks four layers and runs two `repeat: Infinity` scale/opacity loops with no reduced-motion guard — continuous battery drain on a phone. Replace the whole file with:

```tsx
/**
 * The page's atmosphere: a static composed field behind all routes.
 *
 * Previously two blurred blobs ran infinite scale/opacity loops. On the iOS build
 * that is continuous compositing work for motion nobody asked for, and there was no
 * prefers-reduced-motion guard. The depth here comes from layered radial tone
 * instead, which costs nothing after first paint.
 */
export function BackgroundMesh() {
  return (
    <div className="fixed inset-0 z-[-1] pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0 bg-mesh" />
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
```

Keep whatever export style the current file uses (named vs default) so `App.tsx` needs no change — check the existing last line before writing.

- [ ] **Step 2: Simplify the mesh to drop the indigo**

In `client/src/index.css`, `.bg-mesh` at lines 90-95 mixes purple with `rgba(99, 102, 241, …)` — indigo. Violet-plus-indigo is the canonical blue-to-purple pairing. Keep the theme by keeping it all purple. Replace lines 90-95 with:

```css
  .bg-mesh {
    background-image:
      radial-gradient(ellipse 60% 40% at 10% 30%, rgba(168, 85, 247, 0.06), transparent 70%),
      radial-gradient(ellipse 60% 40% at 90% 60%, rgba(124, 58, 237, 0.05), transparent 70%),
      radial-gradient(ellipse 80% 40% at 50% 100%, rgba(124, 58, 237, 0.14), transparent 60%);
  }
```

- [ ] **Step 3: Verify**

Run: `npm run check && npm test`
Then load `/` and confirm the background still has depth and no element is animating. In the console:
```js
document.querySelectorAll('[aria-hidden="true"] *').length
```
Expected: `2` (the mesh layer and the noise layer).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/layout/BackgroundMesh.tsx client/src/index.css
git commit -m "perf(ui): static background instead of two infinite loops"
```

---

## Task 4: Recompose the hero

**Files:**
- Modify: `client/src/features/marketing/Home.tsx:55-72`
- Modify: `client/src/i18n/en.ts`, `client/src/i18n/ar.ts`

- [ ] **Step 1: Rewrite the headline copy**

The hero is three stacked lines whose third is a purple italic fragment — a tall staircase with a colour splash at the foot. Collapse it to two lines with the emphasis inside the phrase.

In `client/src/i18n/en.ts`, in the `home` block, replace the three `heroLine*` keys with two:

```ts
    heroLine1: "Autonomous robots that",
    heroLine2: "work your land, every hour",
```

In `client/src/i18n/ar.ts`, the matching pair:

```ts
    heroLine1: "روبوتات ذاتية القيادة",
    heroLine2: "تعمل في أرضك، كل ساعة",
```

- [ ] **Step 2: Rewrite the hero markup**

In `Home.tsx`, replace the `<h1>` at lines 55-61 with:

```tsx
          <h1 className="text-[44px] md:text-7xl lg:text-[84px] font-light tracking-[-0.035em] leading-[1.02]">
            {t("home.heroLine1")}
            <br />
            <span className="font-medium">{t("home.heroLine2")}</span>
          </h1>
```

Two lines, one weight shift for emphasis, no accent colour and no italic. The emphasis now sits on the phrase that carries the meaning rather than on a stranded fragment.

- [ ] **Step 3: Remove the dead key**

`heroLine3` no longer exists. Confirm nothing references it:

Run: `grep -rn "heroLine3" client/src | wc -l`
Expected: `0`.

- [ ] **Step 4: Verify both languages**

Run: `npm run check && npm test`
Then load `/`, screenshot, and confirm the headline is two lines. Click the `ع` toggle and confirm the Arabic headline is also two lines and reads right-to-left without overflow.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/marketing/Home.tsx client/src/i18n/en.ts client/src/i18n/ar.ts
git commit -m "design(home): two-line hero with emphasis inside the phrase"
```

---

## Task 5: Un-invert the section heads

**Files:**
- Modify: `client/src/features/marketing/Home.tsx:22-32` and its three call sites

- [ ] **Step 1: Fix the hierarchy**

`SectionHead` renders the connective phrase (`tag` — "What they do") as a giant gradient `<h2>`, and demotes the actual editorial line (`title` — "Eyes on every row. Action in every hour") to a muted `<p>`. That is backwards, and the gradient-filled type is its own tell.

Replace lines 22-32 with:

```tsx
function SectionHead({ tag, title, sub }: { tag: string; title: ReactNode; sub?: string }) {
  return (
    <motion.div {...riseIn} className="max-w-3xl mb-12 md:mb-16 px-4">
      {/* The editorial line leads. `tag` is a connective label and sits under it,
          quiet — it was previously set as the giant gradient headline while the real
          sentence was demoted to muted body text. */}
      <h2 className="text-4xl md:text-[52px] font-semibold tracking-[-0.02em] leading-[1.06] mb-3">
        {title}
      </h2>
      <p className="text-[15px] text-muted-foreground/70 mb-4">{tag}</p>
      {sub && <p className="text-[16px] md:text-[17px] text-muted-foreground leading-relaxed">{sub}</p>}
    </motion.div>
  );
}
```

Note it is also no longer centred — every section previously opened with the identical centred small-over-big stack. Left-aligning varies the rhythm and matches the left-aligned capability rows below it.

- [ ] **Step 2: Remove the accent spans from the three call sites**

At `Home.tsx:96`, `:127` and `:185`, the `title` prop wraps its second half in `<span className="text-[#c084fc] italic">`. Remove the span in each, leaving the plain fragments joined by a space:

```tsx
            title={<>{t("home.capsTitle1")} {t("home.capsTitle2")}</>}
```

Apply the same shape to `envTitle1`/`envTitle2` and `howTitle1`/`howTitle2`.

- [ ] **Step 3: Verify the gradient utility is now unused**

Run: `grep -rn "text-gradient" client/src | wc -l`
Expected: `2` — the remaining two are `Home.tsx` CTA and `Fleet.tsx` page heading, handled in Task 6.

- [ ] **Step 4: Verify**

Run: `npm run check && npm test`
Load `/` and confirm each section now opens with the real sentence at full size, left-aligned, with the label beneath it.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/marketing/Home.tsx
git commit -m "design(home): lead sections with the sentence, not the label"
```

---

## Task 6: Retire the gradient headline and the button pair

**Files:**
- Modify: `client/src/features/marketing/Home.tsx:214-241`
- Modify: `client/src/features/marketing/Fleet.tsx:46`
- Modify: `client/src/index.css:105-112`

- [ ] **Step 1: Fix the pre-footer CTA**

At `Home.tsx:222-235` a filled purple pill sits beside an outlined ghost button at identical padding, radius and text size — the stock action row, where the second option exists only to balance the first. Demote the email to a text link. Replace that `<div>` and its two children with:

```tsx
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <button
              onClick={openModal}
              className="px-8 py-4 min-h-[48px] rounded-full bg-primary text-primary-foreground font-medium text-[15px] hover:bg-[#a855f7] transition-colors duration-200"
            >
              {t("home.bookAssessment")}
            </button>
            <a
              href="mailto:info@nasl-tech.com"
              className="text-[15px] text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
            >
              {t("home.emailTeam")}
            </a>
          </div>
```

**No new i18n keys.** `home.emailTeam` already exists in both dictionaries and `info@nasl-tech.com` is the address already in the file — reuse both. Do not invent an address.

Both icons go: `ArrowRight` because the hero already carries one and repeating it makes it a tic, `Mail` because a mailto link does not need a picture of an envelope. Check whether `ArrowRight` and `Mail` are still used elsewhere in the file before touching the import on line 2 — `ArrowRight` is still used in the hero, `Mail` will become unused and must be dropped from the import or the build will warn.

- [ ] **Step 2: Remove `text-gradient` from the two remaining headings**

At `Home.tsx:216` and `Fleet.tsx:46`, delete the `text-gradient` class from the `className` string, leaving the rest untouched. Both headings then render in `--foreground`.

- [ ] **Step 3: Delete the dead utilities**

In `client/src/index.css`, delete the `.text-gradient` block (lines 105-112) and the `.text-glow` block (lines 101-103). `.text-glow` was never used anywhere.

Run: `grep -rn "text-gradient\|text-glow" client/src | wc -l`
Expected: `0`.

- [ ] **Step 4: Verify**

Run: `npm run check && npm test`
Load `/`, scroll to the pre-footer band, confirm one button plus a text link, and click the link to confirm it opens a mail composer.

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "design(home): one action in the closing CTA, no gradient type"
```

---

## Task 7: Give small text more than one costume

**Files:**
- Modify: `client/src/index.css:114-121`
- Modify: `client/src/components/layout/Navigation.tsx:90`

- [ ] **Step 1: Split the eyebrow treatment**

Currently one treatment — mono, uppercase, `0.16em` tracking — carries eyebrows, footer column headings, figure captions, status chips, product roles, spec labels, form labels *and* the nav links. Replace lines 114-121 with two distinct roles:

```css
  /* A section label. Quiet, in the page's own sans, no shouting caps. */
  .eyebrow {
    font-size: 12px;
    letter-spacing: 0.02em;
    color: hsl(var(--muted-foreground));
  }

  /* A data label: mono is correct here because the value beside it IS data —
     a spec figure, a count, a timestamp. This is the only place mono belongs. */
  .data-label {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: hsl(var(--muted-foreground));
  }
```

- [ ] **Step 2: Point the genuine data labels at the new class**

The four `eyebrow` consumers — `Footer.tsx:51`, `Home.tsx:159`, `:194`, `:236` — are all section labels, so they stay on `eyebrow` and simply become quiet. At `Home.tsx:159` the class list is `eyebrow mb-2.5 normal-case tracking-[0.08em]`: those two overrides exist to fight the utility's caps and tracking, and the new definition has neither, so delete `normal-case tracking-[0.08em]` and leave `eyebrow mb-2.5`.

The real data labels do **not** use `eyebrow` — they hand-roll the same look inline. Replace the mono cluster with `data-label` at these four sites, keeping any layout classes (`mb-*`, `text-right`, positioning):

- `Fleet.tsx:183` — `text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2` → `data-label mb-2`
- `Home.tsx:149` — `font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground` → `data-label`
- `Home.tsx:167` — `font-mono text-[11.5px] text-muted-foreground text-right` → `data-label text-right`
- `Home.tsx:203` — `font-mono text-[11.5px] text-muted-foreground text-right` → `data-label text-right`

- [ ] **Step 3: Stop product names being set in mono**

`Fleet.tsx:109` and `:164` set the product name as `font-bold font-mono`. A product name is prose, not data — mono here is decoration, and it contradicts the rule this task just established. Delete `font-mono` from both, leaving the rest of each class list intact.

- [ ] **Step 4: Stop the nav wearing the label costume**

`Navigation.tsx:90` sets nav links as `text-[13px] font-medium uppercase tracking-[0.14em]`. A navigation item is not a label. Replace that fragment with:

```
text-[14px] font-medium tracking-[-0.005em]
```

- [ ] **Step 5: Replace the active-nav dot**

`Navigation.tsx:96-98` marks the current page with a glowing purple dot absolutely positioned beneath the link. Delete that whole `{location === link.href && (…)}` block including its `<span>`.

The active state is already expressed on the type by the conditional on line 91 — `location === link.href ? "text-foreground" : "text-foreground/60"`. With the dot gone that contrast is now carrying the signal alone, so widen it: change the inactive value from `text-foreground/60` to `text-foreground/45`.

Note the link keeps `relative` in its class list even though nothing is absolutely positioned inside it any more — leave it, `Link` may rely on it for focus styling elsewhere.

- [ ] **Step 6: Verify**

Run: `npm run check && npm test`

Then confirm the split actually happened:
```bash
grep -rn "font-mono" client/src --include=*.tsx | wc -l
```
Expected: `9` — down from 15. What remains is `chart.tsx`, `Footer.tsx` (×2), `Admin.tsx`, `Analytics.tsx` (×2), `Home.tsx:82` and `:109` and `:154`, all of which sit beside real values.

Load `/` and confirm: nav links are sentence-case with the current page clearly brighter and no dot; section labels are quiet sans, not tracked caps. Load `/fleet` and confirm product names are no longer monospaced but the spec labels beneath them still are.

- [ ] **Step 7: Commit**

```bash
git add client/src
git commit -m "design(ui): distinct treatments for labels, data and navigation"
```

---

## Task 8: Make the font stack honest

**Files:**
- Modify: `client/src/index.css:1`, `:9-10`, `:47-72`
- Modify: `tailwind.config.ts:87`

- [ ] **Step 1: Stop naming a font that is not there**

`--font-sans` leads with `'Effra', 'Effra Std'`, neither of which is loaded, so every Latin glyph silently falls through to IBM Plex Sans Arabic. Until a licensed webfont exists, name what actually renders. Replace lines 9-10:

```css
    /* The signature face is not yet licensed for web embedding. Naming a family that
       is not loaded means the stack lies about what renders — everything currently
       falls through to Plex. When the licensed woff2 files land, add the @font-face
       blocks and put the family back at the front of this one line; nothing else in
       the codebase needs to change. */
    --font-sans: 'IBM Plex Sans Arabic', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, monospace;
```

- [ ] **Step 2: Make the webfont load non-render-blocking**

Line 1 is a CSS `@import`, which blocks rendering and fires after the `<link rel="preconnect">` in `index.html` is useful. Delete line 1 from `index.css` and add this to `client/index.html` immediately before the closing `</head>`:

```html
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
    />
```

- [ ] **Step 3: Delete the dead `.dark` block**

`index.css:47-72` re-declares 13 tokens with values byte-identical to `:root`, and there is no light mode. Delete lines 47-72 entirely.

- [ ] **Step 4: Remove the undefined serif mapping**

`tailwind.config.ts:87` maps `serif` to `var(--font-serif)`, which is never defined anywhere, so `font-serif` resolves to nothing. Delete that single line from the `fontFamily` block.

- [ ] **Step 5: Verify nothing changed visually**

Run: `npm run check && npm test && npm run build`
Load `/` and confirm the page renders identically — this task removes lies and dead code, it should have no visual effect. Confirm in the console:
```js
getComputedStyle(document.body).fontFamily
```
Expected: `"IBM Plex Sans Arabic", system-ui, sans-serif` — no Effra.

- [ ] **Step 6: Commit**

```bash
git add client/src/index.css client/index.html tailwind.config.ts
git commit -m "chore(ui): honest font stack, non-blocking load, drop dead tokens"
```

---

## Done When

- `npx vitest run test/no-hidden-content.test.ts` passes, and no element in `main` computes to `opacity: 0`.
- `grep -rn "glass-card\|text-gradient\|text-glow" client/src` returns nothing.
- The hero is two lines with no accent-coloured fragment; sections lead with their sentence; the closing CTA has one button.
- Nav links are sentence-case with no dot; mono appears only beside real data.
- `npm run check`, `npm test` and `npm run build` are green, and both EN and AR render correctly.
- **No hue changed anywhere.** `git diff main -- client/src/index.css` shows no edit to any `--purple*`, `--primary`, `--accent`, `--background` or `--foreground` value.

## Explicitly not done

The licensed typeface (blocked on a Dalton Maag web licence and the missing weights); the 75+ hardcoded hex literals; the fake dashboard mockup with traffic-light dots at `Fleet.tsx:217-231`; the radius scale, which is defined, overridden in Tailwind, then bypassed by arbitrary values almost everywhere. Each is a separate decision, and the last two are worth their own pass once these land.
