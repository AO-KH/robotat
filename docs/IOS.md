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
VITE_API_URL=https://robotat2-production.up.railway.app npm run build

# Install the native dependencies CocoaPods could not install off-Mac:
cd ios/App && bundle exec pod install && cd ../..

# Copy the web build into the native project:
npx cap sync ios
```

**`VITE_API_URL` must be the Railway URL.** `robotat.nasl-tech.com` has no DNS record
and has never resolved — building against it produces an app that looks completely
normal and fails every single API call at name resolution. There is no build-time error
for this, because the value is only ever baked in as a string.

**Installing CocoaPods is not one command.** macOS ships Ruby 2.6, and current CocoaPods
depends on gems (`ffi`, `securerandom`) that require Ruby ≥ 3.0. `gem install cocoapods`
therefore fails, and pinning the offending gems one at a time does not converge — each
pin surfaces the next incompatible transitive dependency. Let a modern Bundler resolve
the whole graph against Ruby 2.6 in one pass instead:

```bash
gem install --user-install bundler -v 2.4.22     # system Bundler 1.17 cannot do this
export PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH"

# A Gemfile containing just: source "https://rubygems.org" / gem "cocoapods"
bundle install                                    # resolves to CocoaPods 1.17 on Ruby 2.6

export LANG=en_US.UTF-8                           # CocoaPods aborts without a UTF-8 locale
```

Installing a current Ruby (Homebrew, rbenv) is the tidier long-term fix; the above
avoids needing either.

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

**Do not accept Xcode's "Update to recommended settings" wholesale.** One of the boxes it
pre-ticks is **Enable User Script Sandboxing**, which breaks this project. The Podfile sets
`install! 'cocoapods', :disable_input_output_paths => true`, so the `[CP] Embed Pods
Frameworks` phase in `project.pbxproj` carries `inputPaths = ()` and `outputPaths = ()`;
sandboxing confines a script phase to exactly its declared paths, and that phase runs
`Pods-App-frameworks.sh`, which `rsync`s `Capacitor.framework` and `CapacitorCordova.framework`
into the bundle — `use_frameworks!` is on, so it is doing real work, not exiting early. Empty
declarations plus real writes is a denial on every build. Untick that one; the recommended
warning flags and the asset-symbol extension are harmless.

The same dialog offers to **remove the Embed Swift Standard Libraries setting**, which is
aimed at a file it cannot durably change: `ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = YES` is
not in `project.pbxproj` at all, it is line 1 of the CocoaPods-generated
`Pods-App.{debug,release}.xcconfig`, and `Pods/` is gitignored and regenerated by
`pod install`. Embedding the Swift runtime *is* wasted bundle size at deployment target 14.0,
but the place to fix it is a `post_install` hook in the Podfile.

**Done:**

- **Code signing has a team.** `DEVELOPMENT_TEAM = 889N48X22R` with `CODE_SIGN_STYLE =
  Automatic`, on both Debug and Release. Simulator builds never needed it — `xcodebuild …
  -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO` succeeded
  before it was set — but device builds, TestFlight and submission all do. Not yet proven
  against hardware: a device build also needs the bundle id registered on the developer
  portal and a provisioning profile Xcode is willing to issue, neither of which a simulator
  build exercises.

- **The app icon** is the ROBOTAT "R" on the brand purple gradient (`#65429a → #a84c9d`),
  both lifted from `attached_assets/Robtat_by_Nasl_Logo-02_*.png` so the icon and the site
  share one source of truth. It replaced Capacitor's blue-X placeholder, which would have
  failed review on its own. 1024×1024, opaque, **no alpha channel** — App Store validation
  rejects an icon that has one, and PNG editors add it back silently, so re-check after any
  edit. The dark-on-`#05040c` variants were tried and rejected: they go muddy at home-screen
  size and vanish against a dark wallpaper.
- **`Podfile.lock` and `App.xcworkspace/contents.xcworkspacedata`** exist and are committed.
  The latter is what points the workspace at `Pods/Pods.xcodeproj`; without it the workspace
  builds nothing.

## Dev loop

```bash
VITE_API_URL=https://robotat2-production.up.railway.app npm run build
npx cap copy ios      # push the fresh web build into the native project
npx cap open ios      # opens Xcode → run on a simulator or a signed device
```

Use `npx cap sync ios` (instead of `copy`) whenever native dependencies change.

## Still to do for a shippable app (Phase 4, on the Mac)

These are the remaining Phase 4 items from the improvement plan — code-level pieces
can be prototyped anywhere, but building/signing/submitting is Mac-only:

1. **Native push (APNs)** — one `npm install` away; **no code change**.

   Everything but the native pod is done and tested. The server stores device tokens
   (`push_tokens`, `POST /api/push/register` and `/unregister`), `server/lib/apns.ts`
   signs and sends, and `pushCustomer` in `server/lib/notify.ts` fans a booking status
   change out to the customer's devices and prunes the ones APNs reports as dead.
   On the client, `client/src/lib/push.ts` asks for permission, registers the device and
   — importantly — releases the token on sign-out, before the session is torn down.

   `push.ts` does **not** import `@capacitor/push-notifications`. The plugin's
   JavaScript half is just `registerPlugin('PushNotifications')` from `@capacitor/core`,
   which is already a dependency, so the module binds by name instead. That keeps an
   unbuildable-off-a-Mac dependency out of the tree and the plugin out of the web
   bundle, and it means the install below needs no follow-up edit anywhere.

   On the Mac:

   ```bash
   npm install @capacitor/push-notifications   # for the native pod, not the JS
   npx cap sync ios
   ```

   Then in Xcode, under **Signing & Capabilities**, add the **Push Notifications**
   capability (this writes the `aps-environment` entitlement — without it
   `registrationError` fires and no token is ever issued), and confirm **Background
   Modes → Remote notifications** if silent pushes are ever added.

   Finally, in the Apple Developer portal create an **Apple Push Notifications service
   (APNs)** key, download the `.p8` once, and set on the server:
   `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY` (the `.p8` contents, newlines as
   `\n`), `APNS_BUNDLE_ID` (defaults to `com.nasl.robotat`) and `APNS_ENV=production`
   for a TestFlight/App Store build — the default is the sandbox, which is what a
   development build needs. See `.env.example`. With those unset, push is switched off
   and status changes are logged instead of sent, so nothing breaks.

   This is the primary native value for Guideline 4.2.
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
