# ROBOTAT on iOS (Capacitor)

ROBOTAT ships to the App Store as a native iOS app by wrapping the existing React
client in a [Capacitor](https://capacitorjs.com/) shell — no rewrite. The client
is **bundled into the app** (not a webview pointed at the live site) and talks to
the deployed backend over HTTPS, which — together with native push — satisfies
App Store Guideline 4.2 ("not just a website in a wrapper").

## What's already wired (cross-platform, in this repo)

- `@capacitor/core` + `@capacitor/ios` (deps), `@capacitor/cli` (dev).
- [`capacitor.config.ts`](../capacitor.config.ts) — `appId: com.nasl.robotat`,
  `appName: ROBOTAT`, `webDir: dist/public` (the Vite client build output).
- API base shim ([`client/src/lib/api-base.ts`](../client/src/lib/api-base.ts)):
  when the client is built with `VITE_API_URL` set, relative `/api` calls are
  rewritten to that absolute origin. No-op on the web.
- Bearer-token auth (`POST /api/auth/token` + `Authorization: Bearer …`) — the app
  authenticates with a token instead of cookies (cookies are unreliable from the
  `capacitor://` origin). See the auth module and `bearer-auth.test.ts`.
- npm scripts: `cap:copy`, `cap:sync`, `cap:sync:ios`.

## Hard prerequisites (not in this repo — need a Mac)

- **macOS + Xcode** — iOS apps can only be generated and built on macOS.
- **Apple Developer Program** membership (99 USD/year) for signing + submission.
- The backend **deployed over public HTTPS** (see [DEPLOYMENT.md](DEPLOYMENT.md)) —
  a device cannot reach `localhost`.

## First-time setup (on the Mac)

```bash
npm ci

# Build the web client against the deployed API (baked into the bundle):
VITE_API_URL=https://robotat.nasl-tech.com npm run build

# Generate the native iOS project (creates ./ios) and copy the web build in:
npx cap add ios
npx cap sync ios
```

`npx cap add ios` scaffolds `ios/App/*` (an Xcode project). Commit it — only the
generated build artifacts under it are gitignored (see [.gitignore](../.gitignore)).

## Dev loop

```bash
VITE_API_URL=https://robotat.nasl-tech.com npm run build
npx cap copy ios      # push the fresh web build into the native project
npx cap open ios      # opens Xcode → run on a simulator or a signed device
```

Use `npx cap sync ios` (instead of `copy`) whenever native dependencies change.

## Still to do for a shippable app (Phase 4, on the Mac)

These are the remaining Phase 4 items from the improvement plan — code-level pieces
can be prototyped anywhere, but building/signing/submitting is Mac-only:

1. **Native push (APNs)** — `@capacitor/push-notifications`, register the device
   token with the backend, and fan out assessment status-change notifications to it
   (reuses the Phase 2 notification logic). This is the primary native value for
   Guideline 4.2.
2. **Secure token storage** — keep the bearer token in the iOS Keychain (e.g.
   `@capacitor/preferences` is *not* secure; use a keychain plugin), not localStorage.
3. **App polish** — launch screen, app icon, safe-area/notch layout, offline states.
4. **App Store** — bundle id `com.nasl.robotat`, screenshots, privacy labels,
   TestFlight beta, then submit for review.

## Config reference

| Setting | Value | Where |
| --- | --- | --- |
| App ID (bundle id) | `com.nasl.robotat` | `capacitor.config.ts` |
| App name | `ROBOTAT` | `capacitor.config.ts` |
| Web assets | `dist/public` | `capacitor.config.ts` → `webDir` |
| API origin (native) | `VITE_API_URL` at build time | `.env` / build env |
