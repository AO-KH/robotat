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
- Bearer-token auth, wired end to end: the native build signs in via
  `POST /api/auth/token` (`client/src/features/auth/use-auth.ts`), stores the token in
  `client/src/lib/auth-token.ts`, and `client/src/lib/api-base.ts` attaches it as
  `Authorization: Bearer …` on every `/api` call. The server allows the
  `capacitor://localhost` origin via `server/lib/cors.ts`.
- Token restore-at-boot: `main.tsx` awaits `restoreAuthToken()` before React mounts,
  and a 401 while holding a token clears it from the store rather than retrying a dead
  one every launch. **Still needs a Keychain plugin** to actually survive a relaunch —
  see "Secure token storage" below for the two-line wiring.
- npm scripts: `cap:copy`, `cap:sync`, `cap:sync:ios`.

## Hard prerequisites (not in this repo — need a Mac)

- **macOS + Xcode** — iOS apps can only be generated and built on macOS.
- **Apple Developer Program** membership (99 USD/year) for signing + submission.
- The backend **deployed over public HTTPS** (see [DEPLOYMENT.md](DEPLOYMENT.md)) —
  a device cannot reach `localhost`.

## First-time setup (on the Mac)

**The `ios/` project already exists and is committed** — `npx cap add ios` has been
run and you should not run it again. What is missing is the part that only macOS can
do: CocoaPods never installed, because it does not exist on Windows.

```bash
npm ci

# Build the web client against the deployed API (baked into the bundle):
VITE_API_URL=https://robotat.nasl-tech.com npm run build

# Install the native dependencies CocoaPods could not install off-Mac:
cd ios/App && pod install && cd ../..

# Copy the web build into the native project:
npx cap sync ios
```

`ios/App/*` is a normal Xcode project and is committed, because it is where native
configuration lives — `Info.plist`, icons, entitlements. Only generated artifacts
under it are ignored: `App/Pods`, `App/App/public` (the copied web build),
`capacitor.config.json`, and `capacitor-cordova-ios-plugins`. See
[ios/.gitignore](../ios/.gitignore).

**Already configured, so you do not need to redo it in Xcode:**

| Setting | Value | Why |
| --- | --- | --- |
| Launch screen images | solid `#05040c`, sRGB-tagged | The default was Capacitor's white placeholder. The storyboard's `imageView` is `scaleAspectFill` over the full screen, so **the images are what fixes the flash** — the storyboard's own background colour is only a fallback for a failed asset lookup |
| Webview background | `#05040c` | The second flash point: between the launch screen dismissing and React's first paint. Capacitor parses 8-digit hex here as RGBA, not ARGB |
| `UIUserInterfaceStyle` | `Dark` | The app has one theme and no `prefers-color-scheme` anywhere. Without this the *native* layer stays light on a light-mode device — keyboard, pickers, action sheets — and `prefers-color-scheme` inside the webview reports `light` |
| Status bar | `UIStatusBarStyleLightContent` with `UIViewControllerBasedStatusBarAppearance` **`true`** | Capacitor's `CAPBridgeViewController` reads `UIStatusBarStyle` from this plist and returns it from `preferredStatusBarStyle` — which is the view-controller path, so the key must stay `true`. Setting it `false` looks identical but silently turns `StatusBar.setStyle()` into a no-op if `@capacitor/status-bar` is ever added |
| Line endings | LF for `.pbxproj`/`.plist`/`.storyboard`/`.swift` | Repo is developed on Windows with `autocrlf=true`; see [.gitattributes](../.gitattributes) |

`#05040c` is what `--background: 253 53% 3%` in `client/src/index.css` actually
resolves to. If that token ever changes, these three native surfaces must change with it.

**Not yet done:**

- **The app icon is still Capacitor's placeholder.** `AppIcon-512@2x.png` needs real
  ROBOTAT artwork before submission — this alone will fail review.
- **Code signing is unconfigured.** `project.pbxproj` has `CODE_SIGN_STYLE = Automatic`
  but no `DEVELOPMENT_TEAM`, so the first build fails until you select a team under
  Signing & Capabilities in Xcode.
- **`Podfile.lock` does not exist yet** because `pod install` has never run. Commit it
  once it does — it is not ignored, and `.gitattributes` already pins it to LF.

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
2. **Secure token storage** — one `npm install` and two lines away.

   The boot sequence is done and tested: `main.tsx` awaits `restoreAuthToken()` before
   React mounts, so the token is in memory before the first request is built, and a
   revoked token is cleared from the store on the first 401 instead of being retried
   every launch. `client/src/lib/token-persistence.ts` has `secureTokenPersistence()`,
   which adapts any Capacitor secure-storage plugin — it takes the plugin as an
   argument, so it is unit-tested against a fake even though the plugin itself only
   runs on a device.

   What is missing is a plugin, because installing an untested native dependency off a
   Mac would have been unverifiable. On the Mac:

   ```bash
   npm install <a-capacitor-keychain-plugin>   # must expose get/set/remove
   npx cap sync ios
   ```

   then register it in `client/src/main.tsx`, before `restoreAuthToken()`:

   ```ts
   import { Capacitor } from "@capacitor/core";
   import { registerTokenPersistence } from "./lib/auth-token";
   import { secureTokenPersistence } from "./lib/token-persistence";

   if (Capacitor.isNativePlatform()) {
     const { SecureStoragePlugin } = await import("<the-plugin>");
     registerTokenPersistence(secureTokenPersistence(SecureStoragePlugin));
   }
   ```

   Guard on `isNativePlatform()` so the web build never loads it. **`@capacitor/preferences`
   is not secure** — it is plain `UserDefaults` — and is not an acceptable stopgap for a
   30-day credential. Nor is `localStorage`: anything that can run script in the webview
   can read it.

   Until that lands the app still signs out on relaunch, which is the one part of this
   that could not be finished without the hardware.
3. **App polish** — app icon, offline states. (Launch screen and dark appearance are
   done — see the table above.)
4. **App Store** — bundle id `com.nasl.robotat`, code signing team, screenshots,
   privacy labels, TestFlight beta, then submit for review.

## Config reference

| Setting | Value | Where |
| --- | --- | --- |
| App ID (bundle id) | `com.nasl.robotat` | `capacitor.config.ts` |
| App name | `ROBOTAT` | `capacitor.config.ts` |
| Web assets | `dist/public` | `capacitor.config.ts` → `webDir` |
| API origin (native) | `VITE_API_URL` at build time | `.env` / build env |
