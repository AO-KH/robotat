# ROBOTAT — remaining launch work (handoff)

**Written 2026-08-07.** Every claim below was verified by reading or running the repo on that
date, not recalled. Each carries `file:line` so you can confirm it yourself before acting —
and you should, because some of it will have moved.

The previous session merged `feat/launch-hardening` into `main` (merge commit `98eded6`).
That pass cut the shipped image weight from 30 MB to 2.8 MB, added a privacy policy, split
readiness from liveness, and added four guard tests. This document is what it did **not** do.

## Start here

Read `CLAUDE.md` first — it carries the standing rules, and two of them will bite you:

- **Migrations are hand-authored.** Never run `npm run db:generate` or `db:push`. Write the
  `.sql` under `migrations/`, append to `meta/_journal.json`, derive `meta/NNNN_snapshot.json`
  with a script, then `npm run db:migrate` and `npx drizzle-kit check`. Latest is `0013`.
- **Never run `npm run dev` in a shell** — it does not exit. Use the preview tool if you have
  one; otherwise ask.

Baseline as of the merge: `npm test` = **256 tests / 31 files**, `npm run check` clean,
`npm run build` clean. Two later passes have moved that number — a security review and a
data-correctness review — so take the count from `main` rather than from here; what should
still hold is that the suite is green and typecheck and build are clean.

Also worth knowing: `npm run check` typechecks **neither `script/` nor `test/`** —
`tsconfig.json` includes only `client/src`, `shared`, `server`, `capacitor.config.ts`. Type
errors in those directories only surface when something runs them.

---

## 1. App icon — the one blocker that stops submission

**Verified today:** `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` has
MD5 `0ac741c9e1701ee14dd05ea131f7cfd8` — byte-identical to the template inside
`@capacitor/cli/assets/ios-pods-template.tar.gz`. It is Capacitor's blue placeholder logo on
a grid. Apple rejects placeholder assets. `docs/IOS.md:75` already flags it.

**This is blocked on an asset, not on code.** The two marks in the repo are both unusable:

- `attached_assets/Robtat_by_Nasl_Logo-02_1771961617038.png` — 1317×357, and the purple NASL
  monogram occupies only about **108 px** of that width. Reaching 1024 means a 6× upscale.
- `client/public/favicon.png` — 128×128, and **orange**, not the brand purple. It looks like
  residue from the original Replit scaffold, and is a small defect in its own right.

**What is needed:** a square **1024×1024**, fully opaque, square-cornered PNG (iOS applies its
own mask; a transparent or pre-rounded source leaves black fringes), or a vector to render one
from. Ask the user for it — do not upscale, redraw, or approximate a brand mark. A soft icon
reads to a reviewer much like a placeholder does.

**Once you have it:**

```bash
npm install --save-dev @capacitor/assets
# add to package.json scripts, beside cap:sync:ios:
#   "assets:icon": "capacitor-assets generate --ios --iconBackgroundColor '#05040c' --splashBackgroundColor '#05040c'"
npm run assets:icon
```

`#05040c` matches the `--background` token in `client/src/index.css`, so the launch screen
does not flash a different dark than the app. Confirm by opening the regenerated PNG that it
is the ROBOTAT mark and has no transparency at the corners.

---

## 2. Native iOS — push does not work, and the config claims it does

These form one subsystem. **They need a Mac to verify**, so scope accordingly, but the
dishonesty in the config is worth fixing wherever you are.

**Push cannot function as built.** Verified today:

- `@capacitor/push-notifications` is **not installed** — `package.json` holds only
  `@capacitor/core`, `@capacitor/ios`, `@capacitor/cli`.
- There is **no `.entitlements` file** anywhere under `ios/`, so `aps-environment` is unset.
- `ios/App/Podfile:12-14` declares only the two Capacitor pods.
- `client/src/lib/push.ts:132` binds by name — `registerPlugin<PushPlugin>("PushNotifications")`
  — which resolves to nothing on device.

The server side is complete and tested (`server/lib/apns.ts`, `test/apns.test.ts`). It is the
native half that is missing.

**`capacitor.config.ts:6-7` currently claims this satisfies App Store Guideline 4.2 via native
push.** That claim is false for a build made from this tree. Either make it true or correct the
comment — shipping a config that misstates compliance is the kind of thing that costs a review
cycle.

**Every launch is a signed-out launch.** `client/src/lib/auth-token.ts:49` exports
`registerTokenPersistence`, and `client/src/lib/token-persistence.ts` exists, but **nothing
calls it** — `main.tsx` runs only `installApiBase()` and `restoreAuthToken()`, so there is
nothing to restore from. Needs a Keychain or Preferences plugin behind it.
`docs/IOS.md:24-25` concedes this.

**Code signing is unconfigured.** `ios/App/App.xcodeproj/project.pbxproj:350` has
`CODE_SIGN_STYLE = Automatic` with no `DEVELOPMENT_TEAM`. `ios/App/Podfile.lock` does not
exist, so `pod install` has never run.

**Two smaller ones in the same area:**

- `ITSAppUsesNonExemptEncryption` is **absent** from `ios/App/App/Info.plist` (verified). Not a
  rejection, but every TestFlight and App Store upload blocks on the export-compliance question
  until answered by hand. Adding `<key>ITSAppUsesNonExemptEncryption</key><false/>` removes
  that step — confirm the answer is actually "no" for this app first.
- `script/build.ts:43-47` validates that `VITE_API_URL` is `https://` **when set**, but does
  not require it. Build with it unset and you get an app whose every API call resolves against
  `capacitor://localhost` and fails. Consider requiring it when building for native.

---

## 3. `/api/ready` is publicly reachable and unrated — **DONE**

`/api/ready` runs `SELECT 1` against a pool of ten, and `deploy/Caddyfile` used to be a bare
`reverse_proxy app:5000` with no path matcher, so ten unauthenticated requests could hold every
connection and starve real traffic. The Caddyfile now answers `/api/ready` with a 404 from a
`handle` block ahead of the catch-all; the container healthcheck reaches it on localhost inside
the container and never crosses the proxy. It is deliberately not rate-limited — a 429 reads as
unhealthy and causes the restart loop the probe exists to prevent.

**Still true, and worth knowing:** the Dockerfile healthcheck now points at `/api/ready`, but
nothing in the deployment acts on health status. Caddy does no passive health checking, and
compose uses `restart: unless-stopped`, which ignores it. The change makes `docker ps` honest;
it does not gate traffic. That is arguably correct — the marketing pages need no database, so a
DB outage should not take the homepage down — but the comment at `Dockerfile:27-28` overstates
what it buys.

---

## 4. The asset guard has holes

`test/asset-weight.test.ts` and `script/asset-budget.ts` cap each file at 600 KB. Three gaps,
all latent today:

- **Per-file only.** Ten files at 599 KB each pass — 6 MB shipped, guard green. The 30 MB
  problem it was written for was one enormous file; gradual accumulation walks straight past it.
  A total budget would close this.
- **`client/public/` is never scanned**, and Vite copies it verbatim into the build. It holds
  only `favicon.png` and a 131 KB `og-image.jpg` today, but it is the most natural place for
  someone to drop a hero image.
- **`SHIPPED_IMAGE` omits `.svg` and `.avif`.** An SVG with an embedded base64 raster is a
  common way to smuggle megabytes past exactly this kind of check.

---

## 5. The 664 KB JS bundle is now the largest thing left

`dist/public/assets/index-*.js` is **664 KB**. Before the image work it was a rounding error
next to 29 MB of photographs; now it is the biggest single download, and it ships inside the
iOS binary too.

Worth measuring before optimising — find out what is actually in it (`rollup-plugin-visualizer`
or `vite build --mode analyze`) rather than guessing. Likely candidates are framer-motion,
Radix, and the full lucide-react icon set if it is not being tree-shaken.

Only the two admin screens are currently code-split (`client/src/App.tsx:47-48`).

---

## 6. Error monitoring — nothing exists

Verified: no Sentry, Bugsnag or Rollbar anywhere. Client errors reach `console.error`
(`client/src/components/ErrorBoundary.tsx:57`); server errors reach pino
(`server/app.ts:88`). **In a WKWebView a console error is invisible**, so production crashes in
the iOS app leave no trace at all.

Worth having before real customers arrive. Note that this repo has consistently preferred
writing the small thing itself over adding an SDK — APNs uses `node:http2`, bearer tokens use
`node:crypto`. Discuss the trade-off with the user rather than reaching for a vendor by default.

---

## 7. Email deliverability — the code gates booking on an email that may land in spam

`.env` currently sends from a personal Gmail address (`SMTP_USER`). SPF and DKIM therefore
cover `gmail.com`, not `nasl-tech.com`.

That matters more than it used to: email verification is now a **6-digit code** and booking is
gated on it (`server/modules/assessments/assessments.routes.ts` returns 403 until
`emailVerifiedAt` is set). A confirmation email from a personal address whose subject *is* a
six-digit number is close to a phishing template. If it filters, signups silently stop
converting and nothing in the logs says so.

**This is a provider decision plus DNS records, not a code change.** `MAIL_FROM`, `SMTP_HOST`,
`SMTP_USER` and `SMTP_PASS` already exist for it (`server/lib/notify.ts` — `mailFrom()`).
Verify `nasl-tech.com` with a transactional provider (Resend, Brevo, Postmark all have free
tiers at this volume) and send as `noreply@nasl-tech.com`.

**Never tested against a real inbox other than the owner's.** Worth proving with a second real
address before launch.

---

## 8. Small documentation drift

- `README.md:55` and `CLAUDE.md:43` both still list `server/modules/demo-requests/`. That
  directory does not exist — the table was dropped in
  `migrations/0002_abandoned_karen_page.sql:1`. `docs/ARCHITECTURE.md` was corrected in the
  last pass; these two were not.
- `docs/ARCHITECTURE.md` says shared server infrastructure "lives in `server/lib/`" and lists
  four files; the directory also holds `apns.ts`, `cors.ts`, `env.ts`, `messages.ts`. The four
  descriptions are accurate, just incomplete.
- `docs/DEPLOYMENT.md` gained nothing about graceful shutdown or the healthcheck change.

---

## Suggested order

1. **Ask for the app icon asset.** It is the only hard submission blocker and needs a human.
2. **Email deliverability** — decide the provider; it gates the booking funnel.
3. **Bundle analysis** — measure before optimising.
4. **The native iOS subsystem** — its own plan, when a Mac is available.
5. Error monitoring, asset-guard holes, doc drift — as capacity allows.

## Two things the last session got wrong, so you do not repeat them

**Do not run implementer subagents in parallel on one worktree.** Two were dispatched
concurrently, both rewrote git history, and the collision left the working tree with eight
components calling `t("placeholder.…")` against dictionaries that no longer had those keys.
Both i18n guards passed while it was broken — which is why `test/i18n-keys-exist.test.ts` now
exists. Sequential, always.

**Treat every plan as a hypothesis.** Every subagent in that session found a factual error in
its own brief: a format rule that was physically impossible, a vitest option that had been
removed, a `setupFiles` instruction that measurably slowed the suite, and a privacy-policy
sentence about Meta that was simply false. Verify the brief against the code before executing
it, and say so when it is wrong.
