# Launch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the defects that would get ROBOTAT rejected from the App Store or make it unusable on a farm's mobile connection, and add the guard tests that stop each one coming back.

**Architecture:** Six independent tasks in three groups — submission blockers first (image weight, app icon, privacy policy), then the correctness guards the repo's conventions claim but do not enforce (dictionary parity, translated placeholders), then the testing capability the client side has never had (jsdom + Testing Library). Each task ends green and committed on its own; none depends on a later one.

**Tech Stack:** React 18 + Vite 7, Express 5, Drizzle/Postgres, Capacitor 7 (iOS), Vitest, sharp (new), @testing-library/react (new).

---

## Evidence this plan is built on

Every item below was verified by reading the repo on 2026-08-07, not recalled.

| Finding | Evidence |
|---|---|
| 29 MB of images ship to every visitor | `dist/public/assets/` contains `XMachines_GC02_…JPG` at **13 MB** and `Gemini_Generated_Image_…png` at **8.6 MB**; all 8 are imported via `@assets/…` from `client/src` |
| App icon is Capacitor's placeholder | `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` is byte-identical to the template inside `@capacitor/cli/assets/ios-pods-template.tar.gz` (MD5 `0ac741c9e1701ee14dd05ea131f7cfd8`, 110522 bytes) and untouched since the project was generated. `docs/IOS.md:75` already says so |
| A dead database still reports healthy | `server/routes.ts:14` — `/api/health` returns `{ok:true}` without touching Postgres, and `Dockerfile:29` uses it as the container healthcheck |
| No graceful shutdown | `server/index.ts` is 40 lines with no `SIGTERM`, `SIGINT`, `unhandledRejection` or `uncaughtException` handler |
| Architecture doc describes a dropped table | `docs/ARCHITECTURE.md:105` lists `demo_requests`, dropped in `migrations/0002_abandoned_karen_page.sql:1`; the doc shows 3 tables where `shared/schema.ts` defines 6 |
| No privacy policy anywhere | `grep -rn "privacy\|terms" client/src/App.tsx client/src/components/layout/Footer.tsx` → no matches |
| 8 placeholders never translate | `client/src/features/auth/Auth.tsx:58,93,103`, `ForgotPassword.tsx:68`, `BookDemoModal.tsx:284,295,317,321` — e.g. `placeholder="John Doe"` renders as-is in Arabic |
| Dictionaries are in sync but nothing holds them there | Both `en.ts` and `ar.ts` flatten to exactly 282 keys today; no test asserts it |
| No client component tests are possible | `vitest.config.ts` sets `environment: "node"`; no jsdom, no Testing Library in `package.json` |
| Main JS bundle is 657 KB | `dist/public/assets/index-BZkXshcd.js` |

## Decisions already made — do not revisit

**Images are recompressed in place, keeping their format.** Converting the photo-PNGs to JPEG would be smaller still, but it changes every `@assets/…` import path and the file extension, for a second-order gain. The originals stay recoverable in git history, which is the only backup that matters here.

**The privacy policy is written from the schema, not from a template.** It lists exactly the columns the app stores. A generic policy that claims to cover things ROBOTAT does not collect is worse than none — it is a false statement in a legal document.

**Guard tests scan source, matching the three that already exist** (`type-scale`, `tap-targets`, `no-hidden-content`). They run in the `node` environment and need no DOM.

**Task 6 adds jsdom as a per-file environment**, not globally. The 24 existing test files are server integration tests; putting them all in a DOM would slow every run for no benefit.

---

## File structure

| File | Responsibility |
|---|---|
| `script/optimise-assets.ts` | One-shot: resize and recompress everything in `attached_assets/` |
| `test/asset-weight.test.ts` | Guard: no shipped image over 600 KB |
| `test/i18n-parity.test.ts` | Guard: `en.ts` and `ar.ts` hold identical key sets |
| `test/i18n-inline-copy.test.ts` | Guard: no hardcoded `placeholder="…"` in features |
| `client/src/features/marketing/Privacy.tsx` | Privacy policy page, bilingual, from the dictionaries |
| `client/src/i18n/en.ts`, `ar.ts` | New `privacy.*` and `placeholder.*` keys |
| `client/src/App.tsx` | Route for `/privacy` |
| `client/src/components/layout/Footer.tsx` | Link to `/privacy` |
| `vitest.config.ts` | Per-file jsdom via `environmentMatchGlobs` |
| `test/components/BookDemoModal.test.tsx` | First real component test |

---

## Task 1: Stop shipping 29 MB of photographs

The single worst defect in the app. On a farm on 3G the hero image alone is minutes of waiting, and every byte is also baked into the iOS binary.

**Files:**
- Create: `script/optimise-assets.ts`
- Create: `test/asset-weight.test.ts`
- Modify: `package.json` (add `sharp` devDependency and an `assets:optimise` script)

- [ ] **Step 1: Record the starting weight so the change is measurable**

Run:
```bash
du -sh attached_assets && ls -lh attached_assets/*.JPG attached_assets/*.png | awk '{print $5, $9}'
```
Expected: total around `30M`, with `XMachines_GC02_1771963974422.JPG` at `13M` and `Gemini_Generated_Image_46wxzi46wxzi46wx_1771964517234.png` at `8.6M`.

- [ ] **Step 2: Write the failing guard test**

Create `test/asset-weight.test.ts`:

```ts
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
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run test/asset-weight.test.ts`
Expected: FAIL — several cases, including `XMachines_GC02_1771963974422.JPG is 13312 KB — run npm run assets:optimise`.

- [ ] **Step 4: Add sharp**

Run:
```bash
npm install --save-dev sharp
```
Expected: `added N packages`. sharp is devDependency-only — it runs in the script, never at request time.

- [ ] **Step 5: Write the optimiser**

Create `script/optimise-assets.ts`:

```ts
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
 * In place, and keeping the format. Converting the photo-PNGs to JPEG would be smaller
 * again, but it changes the file extension and therefore all eight import paths for a
 * second-order gain. The originals stay in git history, which is the backup that counts.
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
  }

  console.log(`\nsaved ${Math.round(saved / 1024 / 1024)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

Note `.rotate()`: it applies the EXIF orientation before stripping metadata, so a photo taken sideways does not silently flip.

- [ ] **Step 6: Add the npm script**

In `package.json`, inside `"scripts"`, after the `"mail:test"` line, add:

```json
    "assets:optimise": "tsx script/optimise-assets.ts",
```

- [ ] **Step 7: Run it**

Run: `npm run assets:optimise`
Expected output includes lines like:
```
wrote XMachines_GC02_1771963974422.JPG: 13312 KB -> 214 KB
wrote Gemini_Generated_Image_46wxzi46wxzi46wx_1771964517234.png: 8806 KB -> 412 KB
saved 27 MB
```

- [ ] **Step 8: Run the guard test again**

Run: `npx vitest run test/asset-weight.test.ts`
Expected: PASS, all cases.

- [ ] **Step 9: Rebuild and confirm the bundle shrank**

Run:
```bash
npm run build && du -sh dist/public/assets
```
Expected: the assets directory is now a few MB rather than ~30 MB.

- [ ] **Step 10: Look at the pages, because compression can ruin a photograph**

Start the dev server via the preview tool (never `npm run dev` in a shell) and open Home, Services and Fleet. Confirm the hero and product photographs are not visibly blocky or banded. If one is, raise that file's quality to 88 in `script/optimise-assets.ts`, re-run, and re-check.

- [ ] **Step 11: Commit**

```bash
git add attached_assets script/optimise-assets.ts test/asset-weight.test.ts package.json package-lock.json
git commit -m "perf: stop shipping 29 MB of photographs

Every file in attached_assets is imported through @assets/ and lands in the client
bundle, which is also what gets baked into the iOS binary. Two of them arrived
straight from a camera and a generator at 13 MB and 8.6 MB. On a farm on 3G the
hero image alone was minutes of waiting.

Recompressed in place at 1920px wide, keeping each file's format: converting the
photo-PNGs to JPEG would be smaller again but changes eight import paths for a
second-order gain, and git history holds the originals either way.

The guard test fails on anything over 600 KB, so an unprocessed original cannot
be committed back in."
```

---

## Task 2: Replace Capacitor's placeholder app icon

`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` is the stock blue Capacitor logo. Apple rejects placeholder assets, and it is the first thing a reviewer sees.

**Files:**
- Create: `resources/icon.png` (1024×1024, no transparency, no rounded corners)
- Modify: `ios/App/App/Assets.xcassets/AppIcon.appiconset/*` (generated)
- Modify: `package.json` (add `@capacitor/assets`, add an `assets:icon` script)

- [ ] **Step 1: Confirm what is there now**

Open `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` in an image viewer.
Expected: the blue Capacitor "X" on a faint grid. If it is already a ROBOTAT icon, skip this task.

- [ ] **Step 2: Produce the source icon**

Create `resources/icon.png`, exactly 1024×1024 px, PNG, **fully opaque** and with **square corners** — iOS applies the mask itself, and a transparent or pre-rounded source produces black fringes.

The existing logo `attached_assets/Robtat_by_Nasl_Logo-02_1771961617038.png` is 8.8 KB and wordmark-shaped, so it will not work as-is: a wordmark is illegible at 60 px. Use the ROBOTAT mark on the brand's dark purple background, with generous padding.

If no square mark exists, this task is blocked on a designer. Say so and move to Task 3 rather than shipping a stretched wordmark.

- [ ] **Step 3: Add the generator**

Run:
```bash
npm install --save-dev @capacitor/assets
```

- [ ] **Step 4: Add the npm script**

In `package.json`, inside `"scripts"`, next to `"cap:sync:ios"`, add:

```json
    "assets:icon": "capacitor-assets generate --ios --iconBackgroundColor '#05040c' --splashBackgroundColor '#05040c'",
```

The colour matches the `--background` token in `client/src/index.css`, so the launch screen does not flash a different dark than the app.

- [ ] **Step 5: Generate**

Run: `npm run assets:icon`
Expected: `✔ Generated 1 icon and N splash screens for ios`, and `ios/App/App/Assets.xcassets/AppIcon.appiconset/` now holds ROBOTAT artwork.

- [ ] **Step 6: Confirm by eye**

Open the regenerated `AppIcon-512@2x.png`. Expected: the ROBOTAT mark, not the Capacitor logo, filling the square with no transparency at the corners.

- [ ] **Step 7: Commit**

```bash
git add resources ios package.json package-lock.json
git commit -m "fix(ios): replace Capacitor's placeholder app icon

The bundled icon was still the stock blue Capacitor logo on a grid. Apple rejects
placeholder assets, and it is the first thing a reviewer sees.

Generated from a 1024x1024 opaque source with square corners — iOS applies its own
mask, and a transparent or pre-rounded source leaves black fringes on the device."
```

---

## Task 3: Privacy policy page

Apple requires a reachable privacy policy URL for every app, and this one collects a name, an email, a phone number, a farm location and free text. There is currently no such page.

**Files:**
- Create: `client/src/features/marketing/Privacy.tsx`
- Modify: `client/src/i18n/en.ts`, `client/src/i18n/ar.ts` (add `privacy.*`)
- Modify: `client/src/App.tsx` (route)
- Modify: `client/src/components/layout/Footer.tsx` (link)

- [ ] **Step 1: List what is actually collected, from the schema**

Run:
```bash
grep -n "text(\|timestamp(\|integer(" shared/schema.ts | sed -n '1,60p'
```
Expected: confirms the fields the policy must name — on `users`: name, email, password hash, role, locale; on `assessments`: name, email, phone, company, land size, location, message; plus `analytics_events` and `push_tokens`.

The policy must describe these and nothing else. A template claiming to cover data ROBOTAT does not collect is a false statement in a legal document.

- [ ] **Step 2: Add the copy to both dictionaries**

In `client/src/i18n/en.ts`, add a `privacy` block as a sibling of `booking`:

```ts
  privacy: {
    title: "Privacy Policy",
    updated: "Last updated 7 August 2026",
    intro:
      "ROBOTAT is operated by NASL. This policy describes exactly what we store when you use the website or the app, why, and how to have it removed.",
    collectHeading: "What we store",
    collectAccount:
      "Your account: name, email address, the language you chose, and a one-way hash of your password. We never store the password itself.",
    collectBooking:
      "Your site assessment requests: name, email, phone number, company, land size, location, and whatever you write in the message field.",
    collectUsage:
      "Anonymous usage events: which pages were opened and whether a booking was started or completed. These are not linked to you after you delete your account.",
    collectPush:
      "If you use the iOS app and allow notifications, a device token so we can tell you when your assessment is scheduled.",
    useHeading: "What we do with it",
    useBody:
      "We use it to arrange and carry out your site assessment, and to contact you about it by email and WhatsApp. We do not sell it, and we do not use it for advertising.",
    shareHeading: "Who else sees it",
    shareBody:
      "Our email provider, to deliver messages to you. Meta, if you contact us on WhatsApp. Apple, to deliver push notifications to your device. Nobody else.",
    retainHeading: "How long we keep it",
    retainBody:
      "Your account for as long as you have one. Records of assessments we actually carried out are kept as a business record, with your name and contact details removed, after you delete your account.",
    rightsHeading: "Removing your data",
    rightsBody:
      "You can delete your account at any time from the Account page in the app. That removes your account and strips your name, email, phone number and notes from past assessments.",
    contactHeading: "Contact",
    contactBody: "Questions about this policy: info@nasl-tech.com",
  },
```

In `client/src/i18n/ar.ts`, add the matching block in the same position:

```ts
  privacy: {
    title: "سياسة الخصوصية",
    updated: "آخر تحديث 7 أغسطس 2026",
    intro:
      "ROBOTAT تُدار من قِبل NASL. توضّح هذه السياسة ما نحتفظ به بالضبط عند استخدامك للموقع أو التطبيق، ولماذا، وكيف يمكنك حذفه.",
    collectHeading: "ما الذي نحتفظ به",
    collectAccount:
      "حسابك: الاسم، البريد الإلكتروني، اللغة التي اخترتها، وبصمة أحادية الاتجاه لكلمة المرور. لا نحتفظ بكلمة المرور نفسها إطلاقاً.",
    collectBooking:
      "طلبات زيارة تقييم الموقع: الاسم، البريد الإلكتروني، رقم الهاتف، الشركة، مساحة الأرض، الموقع، وما تكتبه في حقل الرسالة.",
    collectUsage:
      "أحداث استخدام مجهولة المصدر: أي الصفحات فُتحت، وما إذا كان الحجز قد بدأ أو اكتمل. لا ترتبط بك بعد حذف حسابك.",
    collectPush:
      "إذا كنت تستخدم تطبيق iOS وسمحت بالإشعارات، نحتفظ برمز الجهاز لإخبارك عند تحديد موعد زيارتك.",
    useHeading: "كيف نستخدمها",
    useBody:
      "نستخدمها لترتيب زيارة تقييم موقعك وتنفيذها، وللتواصل معك بشأنها عبر البريد الإلكتروني وواتساب. لا نبيعها، ولا نستخدمها للإعلانات.",
    shareHeading: "من يطّلع عليها",
    shareBody:
      "مزوّد البريد الإلكتروني لدينا، لإيصال الرسائل إليك. وMeta، إذا تواصلت معنا عبر واتساب. وApple، لإيصال الإشعارات إلى جهازك. ولا أحد غيرهم.",
    retainHeading: "مدة الاحتفاظ",
    retainBody:
      "حسابك ما دام قائماً. أما سجلات الزيارات التي نفّذناها فعلياً فنحتفظ بها كسجل تجاري، بعد إزالة اسمك وبيانات التواصل الخاصة بك، عند حذف حسابك.",
    rightsHeading: "حذف بياناتك",
    rightsBody:
      "يمكنك حذف حسابك في أي وقت من صفحة الحساب في التطبيق. يؤدي ذلك إلى حذف حسابك وإزالة اسمك وبريدك ورقم هاتفك وملاحظاتك من الزيارات السابقة.",
    contactHeading: "التواصل",
    contactBody: "لأي استفسار حول هذه السياسة: info@nasl-tech.com",
  },
```

- [ ] **Step 3: Write the page**

Create `client/src/features/marketing/Privacy.tsx`:

```tsx
import { motion } from "framer-motion";
import { useI18n } from "@/i18n";
import { useSeo } from "@/lib/seo";
import { riseOnMount } from "@/lib/motion";

/** One heading plus its paragraph. Keeps the section list below readable. */
function Section({ heading, body }: { heading: string; body: string }) {
  return (
    <section className="mt-8">
      <h2 className="text-subhead font-semibold mb-2">{heading}</h2>
      <p className="text-body text-muted-foreground leading-relaxed">{body}</p>
    </section>
  );
}

export default function Privacy() {
  const { t } = useI18n();
  useSeo({ title: "Privacy Policy" });

  return (
    <div className="min-h-screen pt-28 pb-28 md:pb-12 px-4 sm:px-6 lg:px-8">
      <motion.div {...riseOnMount} className="max-w-2xl mx-auto">
        <h1 className="text-heading font-semibold">{t("privacy.title")}</h1>
        <p className="text-label text-muted-foreground mt-1">{t("privacy.updated")}</p>
        <p className="text-body text-muted-foreground leading-relaxed mt-6">{t("privacy.intro")}</p>

        <section className="mt-8">
          <h2 className="text-subhead font-semibold mb-2">{t("privacy.collectHeading")}</h2>
          <ul className="space-y-2 text-body text-muted-foreground leading-relaxed list-disc ps-5">
            <li>{t("privacy.collectAccount")}</li>
            <li>{t("privacy.collectBooking")}</li>
            <li>{t("privacy.collectUsage")}</li>
            <li>{t("privacy.collectPush")}</li>
          </ul>
        </section>

        <Section heading={t("privacy.useHeading")} body={t("privacy.useBody")} />
        <Section heading={t("privacy.shareHeading")} body={t("privacy.shareBody")} />
        <Section heading={t("privacy.retainHeading")} body={t("privacy.retainBody")} />
        <Section heading={t("privacy.rightsHeading")} body={t("privacy.rightsBody")} />
        <Section heading={t("privacy.contactHeading")} body={t("privacy.contactBody")} />
      </motion.div>
    </div>
  );
}
```

`ps-5` rather than `pl-5`: the logical property flips with RTL, which `pl-` does not.

- [ ] **Step 4: Route it**

In `client/src/App.tsx`, add the import beside the other marketing pages:

```tsx
import Privacy from "@/features/marketing/Privacy";
```

and the route inside `<Switch>`, directly after the `/fleet` line:

```tsx
      <Route path="/privacy" component={Privacy} />
```

Not lazily loaded, unlike the admin screens: an App Store reviewer will open this, and a chunk fetch is one more thing that can fail in front of them.

- [ ] **Step 5: Link it from the footer**

In `client/src/components/layout/Footer.tsx`, find the closing of the last link list and add:

```tsx
            <Link href="/privacy" className="min-h-[44px] inline-flex items-center text-body text-muted-foreground hover:text-foreground transition-colors">
              {t("privacy.title")}
            </Link>
```

If `Link` is not already imported in that file, add `import { Link } from "wouter";` at the top.

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: no output (success).

- [ ] **Step 7: Look at it in both languages**

Start the dev server through the preview tool. Open `/privacy` in English, then switch to Arabic with the `ع` toggle.
Expected: full translation, RTL layout, and the bullet list indented on the correct side.

- [ ] **Step 8: Commit**

```bash
git add client/src/features/marketing/Privacy.tsx client/src/App.tsx client/src/components/layout/Footer.tsx client/src/i18n
git commit -m "feat(marketing): add a privacy policy page

Apple requires a reachable privacy policy URL, and this app collects a name, an
email, a phone number, a farm location and free text. There was no such page.

Written from shared/schema.ts rather than from a template: it names the columns
that actually exist and nothing else. A generic policy claiming to cover data
ROBOTAT does not collect would be a false statement in a legal document.

Eagerly routed, unlike the admin screens — a reviewer will open this, and a lazy
chunk fetch is one more thing that can fail in front of them."
```

> **Before submission:** have someone qualified read this. It is accurate about what the code does; whether it satisfies Saudi PDPL and Apple's Data Collection disclosures is a question for a lawyer, not for this plan.

---

## Task 4: Guard that the two dictionaries stay in step

Both flatten to 282 keys today. Nothing holds them there, and a missing key renders as the raw dotted path — `booking.title` in the middle of the page — which is easy to ship and embarrassing to find.

**Files:**
- Create: `test/i18n-parity.test.ts`

- [ ] **Step 1: Write the test**

Create `test/i18n-parity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { en } from "../client/src/i18n/en";
import { ar } from "../client/src/i18n/ar";

/**
 * A key present in one dictionary and not the other is invisible until someone switches
 * language on the page that uses it — and then `t()` renders the dotted path itself, so
 * the page reads "booking.title" mid-sentence.
 *
 * Compares key sets rather than counts: two dictionaries can hold 282 keys each and
 * still disagree about which 282.
 */
function flatten(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n dictionaries", () => {
  const enKeys = flatten(en).sort();
  const arKeys = flatten(ar).sort();

  it("are not empty (the comparison is not passing on two blank objects)", () => {
    expect(enKeys.length).toBeGreaterThan(100);
  });

  it("hold exactly the same keys", () => {
    const missingFromAr = enKeys.filter((k) => !arKeys.includes(k));
    const missingFromEn = arKeys.filter((k) => !enKeys.includes(k));
    expect({ missingFromAr, missingFromEn }).toEqual({ missingFromAr: [], missingFromEn: [] });
  });

  it("have no Arabic value left as its English original", () => {
    // A copied-but-untranslated string is worse than a missing one: it looks finished.
    // Latin-only values are allowed where they are identifiers rather than words.
    const ALLOWED = new Set(["ROBOTAT", "NASL", "WhatsApp", "EN", "ع", "HA"]);
    const offenders: string[] = [];

    const walk = (enNode: unknown, arNode: unknown, path: string) => {
      if (typeof enNode === "string" && typeof arNode === "string") {
        const looksUntranslated =
          enNode === arNode && enNode.length > 3 && !ALLOWED.has(enNode) && /^[\x00-\x7F]+$/.test(enNode);
        if (looksUntranslated) offenders.push(`${path}: "${enNode}"`);
        return;
      }
      if (enNode && arNode && typeof enNode === "object" && typeof arNode === "object") {
        for (const key of Object.keys(enNode as object)) {
          walk(
            (enNode as Record<string, unknown>)[key],
            (arNode as Record<string, unknown>)[key],
            path ? `${path}.${key}` : key,
          );
        }
      }
    };

    walk(en, ar, "");
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run test/i18n-parity.test.ts`
Expected: PASS on the first two cases. The third may list real offenders — if it does, translate them and re-run. Do not widen `ALLOWED` to silence a genuine miss; it is for identifiers only.

- [ ] **Step 3: Prove the guard actually catches a gap**

Temporarily delete any one line from `client/src/i18n/ar.ts` — for example the `close:` entry — and run the test again.
Expected: FAIL, naming the missing key.
Then restore the line and confirm it passes again.

- [ ] **Step 4: Commit**

```bash
git add test/i18n-parity.test.ts client/src/i18n
git commit -m "test(i18n): guard that both dictionaries hold the same keys

They match today at 282 keys each, and nothing held them there. A key present in
one and not the other is invisible until somebody switches language on that page,
at which point t() renders the dotted path itself mid-sentence.

Compares key sets rather than counts — two dictionaries can hold 282 keys each and
still disagree about which 282 — and separately flags an Arabic value left byte
for byte identical to its English original, which looks finished and is not."
```

---

## Task 5: Translate the eight hardcoded placeholders

`placeholder="John Doe"` renders unchanged in Arabic. A Western name as the hint on a Saudi farm's signup form is the kind of detail that tells a customer the app was not built for them.

**Files:**
- Modify: `client/src/i18n/en.ts`, `client/src/i18n/ar.ts`
- Modify: `client/src/features/auth/Auth.tsx:58,93,103`
- Modify: `client/src/features/auth/ForgotPassword.tsx:68`
- Modify: `client/src/features/booking/BookDemoModal.tsx:284,295,317,321`
- Create: `test/i18n-inline-copy.test.ts`

- [ ] **Step 1: Confirm the eight**

Run:
```bash
grep -rn 'placeholder="[A-Za-z]' client/src/features
```
Expected: exactly the eight lines listed above.

- [ ] **Step 2: Add the keys**

In `client/src/i18n/en.ts`, add a top-level `placeholder` block:

```ts
  placeholder: {
    email: "you@example.com",
    fullName: "Your full name",
    landSize: "e.g. 50",
    mapsLink: "https://maps.app.goo.gl/…",
  },
```

In `client/src/i18n/ar.ts`, the same block:

```ts
  placeholder: {
    email: "you@example.com",
    fullName: "اسمك الكامل",
    landSize: "مثال: 50",
    mapsLink: "https://maps.app.goo.gl/…",
  },
```

`email` and `mapsLink` stay Latin in both: they are format examples, not prose, and an Arabic-script example address would be misleading about what the field accepts.

- [ ] **Step 3: Use them**

In `client/src/features/auth/Auth.tsx`, replace on lines 58, 93 and 103 respectively:

```tsx
placeholder="you@company.com"   →   placeholder={t("placeholder.email")}
placeholder="John Doe"          →   placeholder={t("placeholder.fullName")}
placeholder="you@company.com"   →   placeholder={t("placeholder.email")}
```

In `client/src/features/auth/ForgotPassword.tsx` line 68:

```tsx
placeholder="you@company.com"   →   placeholder={t("placeholder.email")}
```

In `client/src/features/booking/BookDemoModal.tsx` lines 284, 295, 317, 321:

```tsx
placeholder="John Doe"          →   placeholder={t("placeholder.fullName")}
placeholder="you@example.com"   →   placeholder={t("placeholder.email")}
placeholder="e.g. 50"           →   placeholder={t("placeholder.landSize")}
placeholder="https://goo.gl/…"  →   placeholder={t("placeholder.mapsLink")}
```

`t` is already in scope in all four files.

- [ ] **Step 4: Write the guard**

Create `test/i18n-inline-copy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Copy belongs in the dictionaries — a convention CLAUDE.md states and nothing enforced.
 *
 * A literal `placeholder="John Doe"` renders byte for byte in Arabic, and a Western name
 * as the hint on a Saudi farm's signup form tells the customer the app was not built for
 * them. Placeholders are the easiest kind to miss because they read as markup.
 *
 * Scans for a literal that starts with a letter. `placeholder="+966…"` and
 * `placeholder="000000"` are format masks, not prose, and pass.
 */
const LITERAL_PLACEHOLDER = /placeholder="[A-Za-z]/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx$/.test(entry) ? [full] : [];
  });
}

describe("user-facing copy", () => {
  const root = path.resolve(__dirname, "..", "client", "src", "features");
  const files = walk(root);

  it("finds files to scan", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("has no hardcoded placeholder text outside the dictionaries", () => {
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => LITERAL_PLACEHOLDER.test(line))
        .map(({ n, line }) => `${path.relative(root, file)}:${n} ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 5: Run both i18n guards**

Run: `npx vitest run test/i18n-inline-copy.test.ts test/i18n-parity.test.ts`
Expected: PASS. If the inline-copy case fails, it prints the exact `file:line` still holding a literal.

- [ ] **Step 6: Typecheck and look at it**

Run: `npm run check` — expected: no output.

Then open the booking modal and the signup form in Arabic through the preview tool.
Expected: the name hint reads `اسمك الكامل`, the land size hint reads `مثال: 50`, and the email hint is still `you@example.com`.

- [ ] **Step 7: Commit**

```bash
git add client/src/features client/src/i18n test/i18n-inline-copy.test.ts
git commit -m "fix(i18n): translate the eight hardcoded placeholders

placeholder=\"John Doe\" rendered byte for byte in Arabic. A Western name as the
hint on a Saudi farm's signup form is the sort of detail that tells a customer the
app was not built for them.

The email and Maps-link hints stay Latin in both languages: they are format
examples rather than prose, and an Arabic-script example address would misrepresent
what the field accepts.

The guard scans for a placeholder literal beginning with a letter, so format masks
like \"+966…\" and \"000000\" still pass."
```

---

## Task 6: Make component testing possible

`vitest.config.ts` sets `environment: "node"`, and there is no jsdom or Testing Library. Every one of the 24 test files is a server integration test or a source scan. Nothing has ever asserted that a component renders — which is why the verification-code screen shipped firing five requests per code.

**Files:**
- Modify: `vitest.config.ts`
- Modify: `package.json`
- Create: `test/components/setup-dom.ts`
- Create: `test/components/BookDemoModal.test.tsx`

- [ ] **Step 1: Install the tooling**

Run:
```bash
npm install --save-dev jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Scope jsdom to component tests only**

In `vitest.config.ts`, inside the `test` object, leave `environment: "node"` as it is and add below it:

```ts
    /*
      jsdom only where a DOM is wanted. The other 24 files are server integration tests
      and source scans; putting all of them in a simulated browser would slow every run
      to buy nothing.
    */
    environmentMatchGlobs: [["test/components/**", "jsdom"]],
```

- [ ] **Step 3: Add the DOM setup file**

Create `test/components/setup-dom.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest does not unmount between cases on its own; without this, the second test in a
// file queries a document that still holds the first test's markup.
afterEach(cleanup);
```

Then add it to the `setupFiles` array in `vitest.config.ts`, so the line reads:

```ts
    setupFiles: ["test/setup.ts", "test/components/setup-dom.ts"],
```

`test/setup.ts` is safe to keep for DOM files — it only loads env.

- [ ] **Step 4: Write a test for behaviour that has actually broken**

Create `test/components/BookDemoModal.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/i18n";
import { DemoModalProvider, useDemoModal } from "@/features/booking/DemoModalContext";
import { BookDemoModal } from "@/features/booking/BookDemoModal";

/**
 * The booking modal, exercised the way a customer drives it.
 *
 * Every previous test in this repo is a server test or a source scan, so nothing has
 * ever asserted that a component behaves — which is how the verification screen shipped
 * firing five requests for one code. This is the first of the other kind.
 */

/** Opens the modal on mount, since it is driven by context rather than by a prop. */
function OpenOnMount() {
  const { openModal } = useDemoModal();
  return (
    <button onClick={openModal} data-testid="open">
      open
    </button>
  );
}

function renderModal() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <DemoModalProvider>
          <OpenOnMount />
          <BookDemoModal />
        </DemoModalProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Signed out, so the modal takes the guest path and needs no session.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/auth/me")) {
        return new Response(JSON.stringify({ message: "Not signed in" }), { status: 401 });
      }
      return new Response(JSON.stringify({ whatsappUrl: "https://wa.me/1?text=x", mailtoUrl: "mailto:x" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

describe("BookDemoModal", () => {
  it("asks for the farm details before either channel, not just email", async () => {
    // Regression guard: WhatsApp used to skip the form and send name and email alone,
    // so a booking arrived with no land size, no location and no phone number.
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId("open"));

    const whatsapp = await screen.findByRole("button", { name: /whatsapp/i });
    await user.click(whatsapp);

    await waitFor(() => {
      expect(screen.getByRole("form") ?? document.querySelector("form")).toBeTruthy();
    });
    for (const name of ["name", "phone", "email", "landSize", "location", "message"]) {
      expect(document.querySelector(`[name="${name}"]`), `${name} field`).toBeTruthy();
    }
  });

  it("is a real dialog, so a screen reader and the Escape key both work", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId("open"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 5: Run it**

Run: `npx vitest run test/components/BookDemoModal.test.tsx`
Expected: PASS, 2 cases.

If the first case fails on finding the WhatsApp button, print what rendered with `screen.debug()` and match the accessible name against the current dictionary rather than loosening the query to `getAllByRole`.

- [ ] **Step 6: Confirm the server suite is untouched**

Run: `npm test`
Expected: all files pass, and the count is the previous total plus the new component cases. The server files must not have moved into jsdom — if they slow noticeably, `environmentMatchGlobs` is matching too widely.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts package.json package-lock.json test/components
git commit -m "test: make component testing possible, and use it

vitest ran everything in the node environment with no jsdom and no Testing Library,
so all 24 files were server integration tests or source scans. Nothing had ever
asserted that a component behaves — which is how the verification screen shipped
firing five requests for a single code.

jsdom is scoped to test/components/** rather than switched on globally: the server
files gain nothing from a simulated browser and would pay for it on every run.

The first two cases cover regressions that actually happened — WhatsApp skipping
the details form, and the modal needing real dialog semantics."
```

---

## Task 7: Make the container tell the truth about its health

`/api/health` returns `{ok:true}` without touching Postgres, and `Dockerfile:29` uses it as the healthcheck. A container whose database is unreachable reports healthy and keeps taking traffic. Separately, `server/index.ts` has no signal handling, so `docker stop` severs in-flight requests.

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/index.ts`
- Modify: `Dockerfile:29`
- Create: `test/health.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/health.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { getApp, closeDb } from "./helpers";

let app: Express;
beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await closeDb();
});

describe("health endpoints", () => {
  it("liveness answers without touching the database", async () => {
    // Deliberately dependency-free: it answers "the process is up", which is the only
    // question a restart policy should act on.
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("readiness reports on the database it actually needs", async () => {
    const res = await request(app).get("/api/ready");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, database: "up" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run test/health.test.ts`
Expected: the first case passes; the second FAILS with `expected 404 to be 200`, because `/api/ready` does not exist.

- [ ] **Step 3: Add the readiness endpoint**

In `server/routes.ts`, directly below the existing `/api/health` line, add:

```ts
  /*
    Readiness, as distinct from liveness above.

    /api/health answers "is this process running", which is the right question for a
    restart policy and deliberately touches nothing. This one answers "can it serve a
    request", which needs the database — and that is the question a load balancer should
    be asking before it sends traffic. Conflating them meant a container with an
    unreachable Postgres reported healthy and kept taking requests it could only fail.

    503 rather than 500: the process is fine, it just cannot serve yet.
  */
  app.get("/api/ready", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.status(200).json({ ok: true, database: "up" });
    } catch (err) {
      log(`readiness check failed: ${String(err)}`, "health");
      res.status(503).json({ ok: false, database: "down" });
    }
  });
```

Add the imports at the top of `server/routes.ts` if not already present:

```ts
import { pool } from "./lib/db";
import { log } from "./lib/log";
```

- [ ] **Step 4: Run the test again**

Run: `npx vitest run test/health.test.ts`
Expected: PASS, both cases.

- [ ] **Step 5: Point the container healthcheck at readiness**

In `Dockerfile`, change line 29 from:

```dockerfile
CMD wget -qO- http://localhost:5000/api/health || exit 1
```

to:

```dockerfile
CMD wget -qO- http://localhost:5000/api/ready || exit 1
```

- [ ] **Step 6: Close down cleanly on SIGTERM**

`server/index.ts` is one `(async () => { … })()` IIFE, and `httpServer` is a `const` **inside** it (line 9). The handlers must go inside that IIFE too — appended after the closing `})()` they would not compile.

Insert the block below **inside the IIFE**, between the `httpServer.listen(…)` call that ends on line 39 and the closing `})();` on line 40:

```ts
/*
  Docker sends SIGTERM and waits ten seconds before SIGKILL. Without this the process
  ignores it, every in-flight request is severed at the ten-second mark, and the Postgres
  pool is never drained — so each deploy leaves connections to time out server-side.

  Closing the HTTP server stops new connections and lets open ones finish; the pool goes
  after, because a request still completing needs it.

  The exit timer is unref'd so it cannot itself hold the process open: it exists only to
  cap how long a wedged connection can delay the shutdown.
*/
const SHUTDOWN_GRACE_MS = 8_000;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return; // SIGINT twice is a person losing patience, not a second shutdown
  shuttingDown = true;
  log(`${signal} received, shutting down`, "express");

  setTimeout(() => {
    log("grace period elapsed, exiting anyway", "express");
    process.exit(1);
  }, SHUTDOWN_GRACE_MS).unref();

  httpServer.close(async () => {
    try {
      await pool.end();
    } catch (err) {
      log(`pool close failed: ${String(err)}`, "express");
    }
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

/*
  A rejected promise nobody caught leaves the process in an unknown state. Logging and
  exiting lets the orchestrator restart into a known one — silently continuing is the
  option that produces the bug report nobody can reproduce.
*/
process.on("unhandledRejection", (reason) => {
  log(`unhandled rejection: ${String(reason)}`, "express");
  void shutdown("unhandledRejection");
});
```

Indent it one level to match the IIFE body, and add `import { pool } from "./lib/db";` to the imports at the top of the file — it is not there today.

- [ ] **Step 7: Verify the shutdown by hand**

Run the dev server through the preview tool, then stop it with the preview tool's stop action and read the logs.
Expected: a `SIGTERM received, shutting down` line, and no stack trace.

- [ ] **Step 8: Full suite and commit**

Run: `npm test` — expected: all pass.

```bash
git add server/routes.ts server/index.ts Dockerfile test/health.test.ts
git commit -m "fix(ops): separate readiness from liveness, and shut down cleanly

/api/health returned ok without touching Postgres, and the Dockerfile used it as
the container healthcheck — so a container whose database was unreachable reported
healthy and kept taking requests it could only fail. /api/ready answers the
question a load balancer is actually asking, and 503s when the database is down.

Liveness stays dependency-free on purpose: it answers 'is the process up', which
is the only question a restart policy should act on.

server/index.ts had no signal handling at all, so docker stop severed in-flight
requests at the ten-second SIGKILL and never drained the pg pool. Now the HTTP
server closes first and the pool after, with an unref'd timer capping how long a
wedged connection can hold the shutdown open."
```

---

## Task 8: Correct the documentation that is now wrong

`docs/ARCHITECTURE.md` diagrams a table dropped four migrations ago and omits four that exist. Five comments still describe email verification as a link, which it stopped being when it became a 6-digit code. Wrong documentation is worse than none: it is read and believed.

**Files:**
- Modify: `docs/ARCHITECTURE.md:105-120`
- Modify: `server/modules/auth/auth.routes.ts:76`
- Modify: `shared/schema.ts:23`
- Modify: `server/lib/env.ts:80`
- Modify: `docs/DEPLOYMENT.md:101`
- Modify: `script/mail-test.ts:81`

- [ ] **Step 1: See the drift for yourself**

Run:
```bash
grep -n "demo_requests" docs/ARCHITECTURE.md
grep -n "verification link\|verification links" server shared script docs -r
```
Expected: `ARCHITECTURE.md:105` names `demo_requests`; five files still say "link".

- [ ] **Step 2: Fix the data model diagram**

In `docs/ARCHITECTURE.md`, replace the three-table diagram at lines 105-120 with this. The columns were read out of `shared/schema.ts` on 2026-08-07; if that file has moved on, re-derive rather than trusting this block.

```
users                          auth_tokens                    assessments
─────────────────────────      ─────────────────────────      ─────────────────────────
id                             id                             id
name                           user_id ──────────────┐        user_id ─────────────┐
email            (unique)      kind                  │        name                 │
email_canonical  (unique) ◄── one mailbox, one account│        email                │
password_hash                  token_hash            │        phone                │
role                           expires_at            │        company              │
email_verified_at              used_at               │        land_size            │
token_version                  attempts              │        location             │
locale                         created_at            │        message              │
created_at ◄───────────────────────────────┘         │        status               │
     ▲                                               │        locale               │
     │                                               │        scheduled_at         │
     └───────────────────────────────────────────────┘        created_at           │
                                                                   ▲               │
push_tokens                    analytics_events                    └───────────────┘
─────────────────────────      ─────────────────────────           (nullable: deleting
id                             id                                   an account detaches
user_id  (cascade delete)      type                                 its bookings, it
token    (unique)              path                                 does not destroy
platform                       visitor_id                           them — 0007)
created_at                     user_id  (set null)
last_seen_at                   created_at

products  ─  id, slug, kind, sort_order, name, role_en, role_ar,
             description_en, description_ar, specs, created_at
```

Notes worth keeping in the prose beneath it: `email_canonical` is uniquely indexed so Gmail alias forms cannot hold several accounts (0011); `auth_tokens.attempts` exists because verification is a 6-digit code and a short code needs a guess limit (0010); `assessments.user_id` is nullable so account deletion can detach rather than destroy a business record (0007).

- [ ] **Step 3: Fix the five stale "link" mentions**

`server/modules/auth/auth.routes.ts:76` — the function emails a code, not a link:
```ts
/** Mint + store a 6-digit verification code for a user and email it. Best-effort. */
```

`shared/schema.ts:23`:
```ts
  // Null until the user confirms their email with the 6-digit code.
```

`script/mail-test.ts:81`:
```ts
        "updates, password resets, confirmation codes — comes here instead of to the\n" +
```

`server/lib/env.ts:80` and `docs/DEPLOYMENT.md:101` describe `PUBLIC_APP_URL` and the Host-header attack. That argument is **still correct** — password reset is genuinely a link. Narrow the wording to say "password-reset links" rather than "verification links", and do not weaken the security rationale.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no output. (Comments only, but the schema edit is inside a `.ts` file.)

- [ ] **Step 5: Commit**

```bash
git add docs server shared script
git commit -m "docs: correct the data model and the stale verification wording

ARCHITECTURE.md diagrammed demo_requests, dropped in migration 0002, and showed
three tables where schema.ts defines six — missing auth_tokens, push_tokens,
analytics_events and products, and several users columns.

Five comments still called email verification a link. It became a 6-digit code,
and some of that wording was written in the same change that made it wrong.

PUBLIC_APP_URL's Host-header argument is untouched: password reset is still a
real link, so the security rationale stands. Only the word 'verification' was
narrowed to 'password-reset'."
```

---

## Verification

**After every task:** `npm run check` and `npm test` both clean, then commit.

**After all six:**

```bash
npm run check
npm test
npm run build
du -sh dist/public/assets
```

Expected: typecheck silent, every test file passing, and `dist/public/assets` a few MB rather than ~30 MB.

Then open the app through the preview tool and confirm in both languages: Home renders its photographs, `/privacy` is reachable from the footer, and the booking modal's hints are translated.

## Not in this plan, and why

**Error monitoring.** Worth having before real customers arrive, but every option is a third-party account and an SDK, and this repo has consistently preferred writing the small thing itself (APNs with `node:http2`, bearer tokens with `node:crypto`). It deserves its own decision, not a task appended here.

**The 657 KB JS bundle.** Real, but second to the 29 MB of images by a factor of forty. Worth revisiting after Task 1, when it becomes the largest thing left.

**A domain email sender.** Mail currently goes out from a personal Gmail address, so SPF and DKIM do not align with `nasl-tech.com` and the verification code — whose subject is a six-digit number — is a plausible spam-filter target. Since the code now gates booking, a filtered email means a signup that silently never converts. This is a provider decision plus DNS records, not a code change: `MAIL_FROM`, `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` already exist for it.

**The native iOS gaps — these need their own plan.** An audit of `ios/` turned up three defects that are real blockers but form a single subsystem, need a Mac to verify, and would unbalance this plan:

- **Push cannot work as built.** `@capacitor/push-notifications` is absent from `package.json` (`node_modules/@capacitor/` holds only `cli`, `core`, `ios`), `ios/App/Podfile:12-14` declares only the two Capacitor pods, and there is no `.entitlements` file anywhere under `ios/`, so `aps-environment` is unset. `client/src/lib/push.ts:132` binds by name — `registerPlugin<PushPlugin>("PushNotifications")` — which resolves to nothing on device. This matters beyond the feature: `capacitor.config.ts:6-7` cites native push as the Guideline 4.2 justification, and that claim is currently false for a build from this tree.
- **Every launch is a signed-out launch.** `client/src/lib/auth-token.ts:49` exports `registerTokenPersistence` and `client/src/lib/token-persistence.ts` exists, but nothing calls it — `main.tsx` only runs `installApiBase()` and `restoreAuthToken()`. Without a Keychain or Preferences plugin behind it there is nothing to restore from. `docs/IOS.md:24-25` concedes this.
- **Code signing is unconfigured.** `project.pbxproj:350` has `CODE_SIGN_STYLE = Automatic` with no `DEVELOPMENT_TEAM`; `ios/App/Podfile.lock` does not exist, so `pod install` has never run.

Two smaller iOS items belong with them: `ITSAppUsesNonExemptEncryption` is missing from `Info.plist`, which blocks every upload on the export-compliance question until answered by hand; and `script/build.ts` validates `VITE_API_URL`'s format but does not require it, so a build with it unset silently produces an app whose every API call resolves against `capacitor://localhost` and fails.

**Error monitoring.** Nothing exists — client errors reach `console.error` (`client/src/components/ErrorBoundary.tsx:57`) and server errors reach pino (`server/app.ts:88`). In a WKWebView a console error is invisible, so production crashes would leave no trace. Worth doing before real customers arrive, but every option is a third-party account and an SDK, and this repo has consistently preferred writing the small thing itself. It deserves its own decision, not a task appended here.

**The 657 KB JS bundle.** Real, but second to the 29 MB of images by a factor of forty. Worth revisiting after Task 1, when it becomes the largest thing left.

**A domain email sender.** Mail goes out from a personal Gmail address, so SPF and DKIM do not align with `nasl-tech.com` and the confirmation code — whose subject *is* a six-digit number — is a plausible spam-filter target. Since that code now gates booking, a filtered email is a signup that silently never converts. This is a provider choice plus DNS records, not a code change: `MAIL_FROM`, `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` already exist for it.

**`UIRequiredDeviceCapabilities` still lists `armv7`** (`Info.plist:31`) against an arm64-only deployment target of 14.0. Flagged as an inconsistency; whether current App Store validation rejects it was not verified, so it is not written as a task.
