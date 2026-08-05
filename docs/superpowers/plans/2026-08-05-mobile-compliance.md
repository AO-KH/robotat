# Mobile Compliance Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring ROBOTAT's UI up to the measurable rules in the `mobile-app-ui-design` skill, so the Capacitor iOS build behaves like an app rather than a desktop site in a webview.

**Architecture:** Four enforceable rules, each with a guard test so it cannot silently rot: every fetched list has failure and empty states, every tap target clears 44×44 at the 375px baseline, type comes from a four-role scale instead of 28 ad-hoc sizes, and weight is limited to two. Shared primitives live in `client/src/components/`; the scale lives in `index.css` beside `.surface`.

**Tech Stack:** React 18, Vite, Tailwind, TanStack Query, Vitest (node environment).

---

## Decisions already made — do not revisit

**The de-slopped visual language stays.** The skill recommends glassmorphism, glow effects and celebratory micro-animations. `slop.md` and the merged `design/de-slop` branch deliberately removed exactly those — the `backdrop-filter` removal was for measured WKWebView scroll cost, not taste. **No task here reintroduces blur, glow, sparkles or celebration.** The user chose this explicitly.

**No hue changes.** Same constraint as the de-slop work. `:root` colour tokens in `client/src/index.css` are off limits.

**Scope is the compliance pass**, not a layout restructure and not a redesign. Screen composition stays as it is.

## Measured baseline (2026-08-05, before any task)

| Rule | Current |
| --- | --- |
| Max 4 font sizes | **28** |
| Max 2 font weights | **5** — medium ×79, bold ×38, semibold ×26, normal ×3, light ×1 |
| Tap targets ≥44×44 @375px | **11 of 17 fail** |
| Error/empty states | 2 of 4 fetch surfaces (`VerifyEmail`, `AssessmentDetail`) |
| Horizontal overflow @375px | passes |

**Testing note:** Vitest runs `environment: "node"` with `include: ["test/**/*.test.ts"]` and no jsdom, so components cannot be rendered in tests. Guards are source scans — the same approach as the existing `test/no-hidden-content.test.ts`, which is the model to follow.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `client/src/components/QueryState.tsx` (create) | The one place a fetched list decides between loading / failed / empty / content. |
| `client/src/components/ErrorBoundary.tsx` (create) | Stops a render-time throw turning the whole app white. |
| `client/src/index.css` (modify) | The four type roles, beside `.surface` in `@layer components`. |
| `test/type-scale.test.ts` (create) | Fails on any new arbitrary `text-[…]` or a third font weight. |
| `test/tap-targets.test.ts` (create) | Fails on interactive elements declared below the 44px floor. |

---

## Task 1: Give every fetched list a failure and an empty state

**Files:**
- Create: `client/src/components/QueryState.tsx`
- Modify: `client/src/features/marketing/Fleet.tsx`, `client/src/features/dashboard/Dashboard.tsx`, `client/src/features/admin/Admin.tsx`, `client/src/features/admin/Analytics.tsx`

This is the highest-value task because it fixes a live defect, not a style rule. `Fleet.tsx` destructures `const { data: products = [], isLoading } = useProducts()` and then branches only on `isLoading`. When `/api/products` fails, `data` is undefined, the `= []` default kicks in, `isLoading` goes false, and the page renders its heading above an empty grid — no message, no retry. `client/src/lib/queryClient.ts` sets `retry: false`, `staleTime: Infinity` and `refetchOnWindowFocus: false`, so it never recovers without a manual reload.

- [ ] **Step 1: Create the shared component**

```tsx
import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";

/**
 * A fetched list has four possible answers, not two: still loading, it failed, it
 * came back empty, or here is the content. Rendering only the last two is why a
 * failed /api/products left the products page showing its heading above nothing —
 * indistinguishable from a catalogue with no products in it. With `retry: false`
 * and `staleTime: Infinity` in lib/queryClient.ts, that state was also permanent.
 *
 * `onRetry` should be the query's own `refetch`, which bypasses staleTime.
 */
export function QueryState({
  isLoading,
  isError,
  isEmpty,
  onRetry,
  loadingLabel,
  errorTitle,
  errorBody,
  retryLabel,
  emptyTitle,
  emptyBody,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  onRetry?: () => void;
  loadingLabel: string;
  errorTitle: string;
  errorBody: string;
  retryLabel: string;
  emptyTitle: string;
  emptyBody: string;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="py-16 flex justify-center" role="status" aria-live="polite">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        {/* The spinner is decorative; this is what a screen reader actually announces. */}
        <span className="sr-only">{loadingLabel}</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="surface rounded-2xl py-12 px-6 text-center" role="alert">
        <h3 className="text-heading mb-2">{errorTitle}</h3>
        <p className="text-body text-muted-foreground max-w-md mx-auto mb-6">{errorBody}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 min-h-[44px] px-6 rounded-full bg-primary text-primary-foreground text-body hover:bg-[#a855f7] transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> {retryLabel}
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="surface rounded-2xl py-12 px-6 text-center">
        <h3 className="text-heading mb-2">{emptyTitle}</h3>
        <p className="text-body text-muted-foreground max-w-md mx-auto">{emptyBody}</p>
      </div>
    );
  }

  return <>{children}</>;
}
```

`text-heading` and `text-body` are defined in Task 3. Until then they resolve to nothing and inherit — harmless, and Task 3 makes them real. Do not substitute arbitrary sizes here.

- [ ] **Step 2: Wire it into the products page**

In `client/src/features/marketing/Fleet.tsx`, change the destructure to expose the error and refetch:

```tsx
  const { data: products = [], isLoading, isError, refetch } = useProducts();
```

Replace the `{isLoading ? (<spinner/>) : (<div className="grid …">…</div>)}` block with the grid wrapped in `QueryState`:

```tsx
        <QueryState
          isLoading={isLoading}
          isError={isError}
          isEmpty={products.length === 0}
          onRetry={() => refetch()}
          loadingLabel={t("state.loading")}
          errorTitle={t("state.errorTitle")}
          errorBody={t("state.errorBody")}
          retryLabel={t("state.retry")}
          emptyTitle={t("fleet.emptyTitle")}
          emptyBody={t("fleet.emptyBody")}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* existing product cards, unchanged */}
          </div>
        </QueryState>
```

Add the import: `import { QueryState } from "@/components/QueryState";`

- [ ] **Step 3: Add the copy to both dictionaries**

In `client/src/i18n/en.ts`, add a top-level `state` block (shared by every surface) and two `fleet` keys:

```ts
  state: {
    loading: "Loading",
    errorTitle: "We couldn't load this",
    errorBody: "Something went wrong reaching our servers. Check your connection and try again.",
    retry: "Try again",
  },
```
```ts
    emptyTitle: "No products to show yet",
    emptyBody: "Our catalogue is being updated. Please check back shortly.",
```

In `client/src/i18n/ar.ts`, the matching entries:

```ts
  state: {
    loading: "جارٍ التحميل",
    errorTitle: "تعذّر تحميل هذا المحتوى",
    errorBody: "حدث خطأ أثناء الاتصال بخوادمنا. تحقّق من اتصالك وحاول مرة أخرى.",
    retry: "إعادة المحاولة",
  },
```
```ts
    emptyTitle: "لا توجد منتجات لعرضها بعد",
    emptyBody: "يجري تحديث الكتالوج. يُرجى المراجعة قريبًا.",
```

Match the existing file structure exactly — check how `home`/`fleet` blocks are declared and whether the dictionary is typed, so `state` is added the same way in both files and the types still line up.

- [ ] **Step 4: Wire the remaining three surfaces**

Apply the same pattern to:
- `client/src/features/dashboard/Dashboard.tsx` — the assessments list. Empty copy: `dashboard.emptyTitle` = `"No bookings yet"`, `dashboard.emptyBody` = `"Book a site assessment and it will appear here."` (Arabic: `"لا توجد حجوزات بعد"` / `"احجز تقييمًا للموقع وسيظهر هنا."`)
- `client/src/features/admin/Admin.tsx` — the bookings table. Empty: `admin.emptyTitle` = `"No bookings match this filter"`, `admin.emptyBody` = `"Try a different status filter."` (Arabic: `"لا توجد حجوزات مطابقة"` / `"جرّب عامل تصفية آخر."`)
- `client/src/features/admin/Analytics.tsx` — the summary. Empty: `analytics.emptyTitle` = `"No activity recorded yet"`, `analytics.emptyBody` = `"Analytics will appear once visitors start using the site."` (Arabic: `"لم يُسجَّل أي نشاط بعد"` / `"ستظهر التحليلات بمجرد بدء الزوار في استخدام الموقع."`)

All three reuse the shared `state.*` error copy. Read each file first — their current loading/empty handling differs, and `Analytics` renders an object rather than a list, so its `isEmpty` is a field check (e.g. `!data || data.totalPageViews === 0`), not `.length === 0`.

- [ ] **Step 5: Let reads retry**

In `client/src/lib/queryClient.ts`, change the queries default from `retry: false` to:

```ts
      // One transient failure should not strand a screen forever. Mutations stay at
      // retry: false — re-sending a booking or a password change is not safe to repeat.
      retry: 2,
      retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
```

Leave `mutations: { retry: false }` exactly as it is.

- [ ] **Step 6: Verify**

Run: `npm run check && npm test`
Expected: typecheck silent, 87 tests passing.

Then in the browser at `http://localhost:5000/fleet`, prove the failure path actually renders — block the request at the network layer and do a **full reload** so the query genuinely re-runs (patching `window.fetch` and navigating client-side will not work: `staleTime: Infinity` serves the cached list and no request is made). Use the browser tools' request interception, or temporarily stop the API. Confirm you see the error card and that "Try again" recovers once the API is back.

Report exactly how you forced the failure. If you cannot force it, say so plainly rather than claiming the state works.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/QueryState.tsx client/src/features client/src/i18n client/src/lib/queryClient.ts
git commit -m "fix(ui): give every fetched list a failure and empty state"
```

---

## Task 2: Stop a render error whiting out the app

**Files:**
- Create: `client/src/components/ErrorBoundary.tsx`
- Modify: `client/src/App.tsx`

A render-time throw currently unmounts the entire tree — observed during this project's testing, when an error in `<Home>` left a blank white page. On an App Store build that is a Guideline 2.1 rejection.

- [ ] **Step 1: Create the boundary**

```tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * A render-time throw anywhere below this point takes out only this subtree, not the
 * whole document. Without it React unmounts everything and the user gets a white
 * screen with no way forward — which on an App Store submission reads as a crash.
 *
 * Class component because React exposes no hook equivalent for componentDidCatch.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ui] unhandled render error", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="surface rounded-2xl py-12 px-6 max-w-md">
          <h1 className="text-heading mb-2">Something went wrong</h1>
          <p className="text-body text-muted-foreground mb-6">
            The page didn't load correctly. Reloading usually fixes it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="min-h-[44px] px-6 rounded-full bg-primary text-primary-foreground text-body hover:bg-[#a855f7] transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
```

This copy is deliberately not translated: the boundary catches failures that may include the i18n provider itself, so calling `t()` here could throw inside the error handler.

- [ ] **Step 2: Mount it**

In `client/src/App.tsx`, wrap the router — inside the providers so the boundary can still use theme styling, but around the route content. Add `import { ErrorBoundary } from "@/components/ErrorBoundary";` and wrap the `<Router />` (or equivalent route switch) in `<ErrorBoundary>…</ErrorBoundary>`.

- [ ] **Step 3: Verify it actually catches**

Temporarily add `throw new Error("boundary test")` at the top of `Home`'s function body, load `/`, and confirm you get the fallback card rather than a blank page. **Then revert it** and confirm the page renders normally again. Paste what you saw in both states.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ErrorBoundary.tsx client/src/App.tsx
git commit -m "fix(ui): contain render errors instead of blanking the page"
```

---

## Task 3: Four type roles instead of twenty-eight sizes

**Files:**
- Modify: `client/src/index.css`
- Modify: every `.tsx` under `client/src` using an arbitrary `text-[…]` or a Tailwind size utility
- Create: `test/type-scale.test.ts`

- [ ] **Step 1: Define the scale**

In `client/src/index.css`, inside the existing `@layer components` block (below `.surface`), add:

```css
  /* Four roles, and only four. Twenty-eight ad-hoc sizes meant nothing was reliably
     bigger than anything else, and each new screen invented its own. Each role carries
     its own tracking and leading, so call sites stop hand-tuning those too.
     Sizes are on the 4pt grid; the responsive step is part of the role, not a new one. */
  .text-display {
    font-size: 44px;
    line-height: 1.02;
    letter-spacing: -0.035em;
  }
  .text-heading {
    font-size: 32px;
    line-height: 1.08;
    letter-spacing: -0.02em;
  }
  .text-body {
    font-size: 16px;
    line-height: 1.6;
  }
  .text-label {
    font-size: 12px;
    line-height: 1.4;
  }

  @media (min-width: 768px) {
    .text-display { font-size: 84px; }
    .text-heading { font-size: 52px; }
    .text-body { font-size: 17px; }
  }
```

- [ ] **Step 2: Migrate call sites role by role**

Work through `client/src` replacing size utilities with the role that matches the element's job:

- `text-[84px]`, `text-7xl`, `text-[56px]`, `text-[44px]`, `text-5xl` → `text-display`
- `text-[52px]`, `text-4xl`, `text-3xl`, `text-[28px]`, `text-[26px]`, `text-[24px]`, `text-2xl`, `text-[22px]` → `text-heading`
- `text-xl`, `text-lg`, `text-[17px]`, `text-[16px]`, `text-base`, `text-[15.5px]`, `text-[15px]`, `text-[14.5px]`, `text-sm`, `text-[14px]` → `text-body`
- `text-[13px]`, `text-[12.5px]`, `text-xs`, `text-[11px]`, `text-[10px]`, `text-[0.8rem]` → `text-label`

**Remove the paired responsive variant** when it duplicates what the role already does — e.g. `text-4xl md:text-[52px]` becomes just `text-heading`, because the role's own media query handles the step. Leave genuinely different responsive intent alone and report it.

**Do not touch** `.eyebrow` and `.data-label` in `index.css` — those already set their own `font-size` deliberately and are a separate, working system from the de-slop work.

**`client/src/components/ui/**` is shadcn vendor code.** Migrate it only where it is actually rendered in this app; leave unused primitives alone and report which you skipped.

- [ ] **Step 3: Write the guard**

Create `test/type-scale.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Type comes from four roles — text-display / text-heading / text-body / text-label,
 * defined in client/src/index.css. Before this the app had 28 distinct sizes, so
 * nothing was dependably bigger than anything else and every new screen invented its
 * own. An arbitrary `text-[19px]` is how that comes back.
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

describe("typography uses the four-role scale", () => {
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
    expect(offenders, "Use text-display / text-heading / text-body / text-label instead").toEqual([]);
  });
});
```

- [ ] **Step 4: Verify**

Run: `npx vitest run test/type-scale.test.ts && npm test && npm run check`
Expected: the new guard passes, the full suite passes, typecheck silent.

Then load `/`, `/fleet`, `/services`, `/auth` at both 375px and desktop widths and confirm nothing is obviously mis-sized. Report any element whose new role looks wrong for its job — the mapping above is a first pass and some call sites will need judgement.

- [ ] **Step 5: Commit**

```bash
git add client/src test/type-scale.test.ts
git commit -m "design(ui): four type roles instead of twenty-eight sizes"
```

---

## Task 4: Two font weights instead of five

**Files:**
- Modify: every `.tsx` under `client/src` using a weight utility
- Modify: `test/type-scale.test.ts`

The app uses `font-medium` ×79, `font-bold` ×38, `font-semibold` ×26, `font-normal` ×3, `font-light` ×1. The skill allows two. Keep **`font-normal` (400)** for everything that is read, and **`font-semibold` (600)** for everything that is a heading, a button label, or deliberate emphasis.

- [ ] **Step 1: Map the weights**

- `font-light` → `font-normal`
- `font-medium` → `font-normal` on body copy, list text, table cells, form labels and nav links; `font-semibold` where it is a button label or a card title
- `font-bold` → `font-semibold`
- `font-semibold` → unchanged

Where an element carries a role class that already implies prominence (`text-display`, `text-heading`), prefer `font-semibold`. Judge each `font-medium` by what the element does, not by a blanket rule, and report the split you chose.

- [ ] **Step 2: Extend the guard**

Add a second test to `test/type-scale.test.ts`, inside the same `describe`:

```ts
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
```

- [ ] **Step 3: Verify**

Run: `npx vitest run test/type-scale.test.ts && npm test && npm run check`

Then check `/` and `/dashboard` in the browser. Losing `font-medium` across 79 sites is the most visually significant change in this plan — **report honestly if the page now reads flat or under-emphasised**, and say which elements you would promote to `font-semibold`. Do not tune it yourself.

- [ ] **Step 4: Commit**

```bash
git add client/src test/type-scale.test.ts
git commit -m "design(ui): limit type to two weights"
```

---

## Task 5: Every tap target clears 44×44

**Files:**
- Modify: `client/src/components/layout/Navigation.tsx`, `client/src/components/layout/Footer.tsx`, and any other file with an undersized control
- Create: `test/tap-targets.test.ts`

Measured at 375px: 11 of 17 interactive elements are below the floor. The sign-in link and language toggle are 42×42; footer links are 29px tall.

- [ ] **Step 1: Find them all**

Start the dev server, load each route at 375px, and run:

```js
[...document.querySelectorAll('a, button, input, select, [role="button"]')]
  .filter(e => e.getBoundingClientRect().width > 0)
  .map(e => ({ tag: e.tagName, text: (e.textContent||'').trim().slice(0,30),
               w: Math.round(e.getBoundingClientRect().width),
               h: Math.round(e.getBoundingClientRect().height) }))
  .filter(t => t.h < 44 || t.w < 44)
```

Do this for `/`, `/fleet`, `/services`, `/auth`, `/dashboard`. Report the full list before changing anything.

- [ ] **Step 2: Fix by padding, not by growing text**

For each offender add `min-h-[44px]` and enough horizontal padding to clear 44px wide, keeping the visual size of the text. For inline text links in a row (footer, nav), prefer vertical padding — `py-3` — over a min-height that would break the inline layout, and verify the resulting box actually measures ≥44.

The logo link is exempt if it is decorative and duplicated by a nav "Home" entry — check whether it is, and report your reasoning rather than assuming.

- [ ] **Step 3: Guard the declared floor**

Create `test/tap-targets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Touch targets need 44×44 (Apple HIG, and the mobile-app-ui-design skill). This is a
 * source scan, so it catches the common regression — a control declared with a fixed
 * height below the floor — not every possible layout outcome. Measuring the rendered
 * box needs a browser; see Task 5 Step 1 for that check.
 */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const VENDOR = /client[\\/]src[\\/]components[\\/]ui[\\/]/;

describe("touch targets", () => {
  it("declares no interactive element shorter than 44px", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles("client/src")) {
      if (VENDOR.test(file)) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        const m = line.match(/\b(?:min-)?h-\[(\d+)px\]/);
        if (m && Number(m[1]) < 44 && /<(button|a|input)\b/.test(line)) {
          offenders.push(`${file.replace(/\\/g, "/")}:${i + 1} (${m[0]})`);
        }
      });
    }
    expect(offenders, "Touch targets need at least 44px — Apple HIG").toEqual([]);
  });
});
```

- [ ] **Step 4: Re-measure and verify**

Re-run the Step 1 snippet on all five routes. Expected: an empty list, or only the exempt logo with your reasoning.

Run: `npm test && npm run check && npm run build`

Also confirm no horizontal overflow appeared at 375px:
```js
document.documentElement.scrollWidth > window.innerWidth
```
Expected: `false` on every route — padding added to nav and footer links is the most likely thing to push a row wide.

- [ ] **Step 5: Commit**

```bash
git add client/src test/tap-targets.test.ts
git commit -m "fix(a11y): every touch target clears the 44px floor"
```

---

## Done When

- `npm test`, `npm run check` and `npm run build` are all green.
- `npx vitest run test/type-scale.test.ts test/tap-targets.test.ts test/no-hidden-content.test.ts` passes.
- At 375px on `/`, `/fleet`, `/services`, `/auth`, `/dashboard`: no tap target under 44×44 (bar a documented exemption), and no horizontal overflow.
- `/fleet` shows a real error card with a working "Try again" when the API is down, and an empty state when the catalogue is empty — demonstrated, not asserted.
- A thrown error in a route renders the boundary card, not a white page.
- Both EN and AR still render correctly, RTL included.
- `git diff main -- client/src/index.css` shows **no change to any `--purple*`, `--primary`, `--accent`, `--background`, `--foreground` or `--card` value**, and no `backdrop-blur`, glow or celebratory animation has been reintroduced.

## Explicitly not done

The skill's decorative half — glassmorphism, glow, sparkles, celebratory feedback, peak-end moments — declined by the user's explicit decision, and in tension with the merged de-slop work. Layout restructuring for the thumb zone, bottom-nav rethink, and reducing interaction cost on Fleet/Dashboard: deferred with the "compliance pass" scope choice. The remaining off-grid *spacing* values (`p-[1px]`, `px-[18px]`, `px-[22px]`, `p-[88px]`) are cosmetic and left alone; the type scale removes the large majority of grid violations, which were sizes.
