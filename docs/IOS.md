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
VITE_API_URL=https://www.robotat.sa npm run build

# Install the native dependencies CocoaPods could not install off-Mac:
cd ios/App && bundle exec pod install && cd ../..

# Copy the web build into the native project:
npx cap sync ios
```

**`VITE_API_URL` must be an origin that actually resolves — check, do not assume.** The
value is only ever baked in as a string, so there is no build-time error for a dead
origin: you get an app that looks completely normal and fails every single API call at
name resolution, on a device, after you shipped it. This has already bitten this project
once with `robotat.nasl-tech.com`, which never had a DNS record at all.

`www.robotat.sa` is the intended public origin. **Note the `www`, and do not "tidy" it
away.** Railway issues a **CNAME** target for custom domains, a CNAME cannot exist at a
zone apex, and `robotat.sa` is hosted on T2's nameservers (`pns01/pns02.t2.sa`), which
offer no ALIAS or CNAME flattening. Bare `robotat.sa` therefore does not resolve and is
not planned to; only the `www` host is wired up. Reaching the apex would mean moving the
nameservers to a provider that flattens (Cloudflare) — a deliberate trade, not a typo to
fix.

The origin that answers today is `https://robotat2-production.up.railway.app`. Before
cutting a release build, run:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://www.robotat.sa/api/products   # want 200
```

A wildcard `*.robotat.sa` record does **not** count as a working setup, however plausible
it looks: it never matches the apex, and Railway serves only the hostnames registered as
custom domains in its dashboard, so everything else answers with a certificate warning
rather than with nothing — a worse failure than an unconfigured domain.

**Installing CocoaPods needs `GEM_HOME` set, and almost nothing else.** There is a
[`Gemfile`](../Gemfile) at the repo root now, pinning CocoaPods to 1.17.0 — the version
that produced the committed `ios/App/Podfile.lock`:

```bash
gem install --user-install bundler -v 2.4.22     # system Bundler 1.17 cannot resolve this
export PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH"
export GEM_HOME="$HOME/.gem/ruby/2.6.0"          # ← the one that actually matters
export LANG=en_US.UTF-8                          # CocoaPods aborts without a UTF-8 locale
bundle install
```

**Do not skip `GEM_HOME`.** Without it Bundler installs into the system gem directory,
`/Library/Ruby/Gems/2.6.0`, which is root-owned, and every gem needing to write there
fails. What makes this cost hours is how it presents: Bundler reports

```
An error occurred while installing json (2.7.6), and Bundler cannot continue.
In Gemfile:
  cocoapods was resolved to 1.17.0, which depends on
    cocoapods-core was resolved to 1.17.0, which depends on
      algoliasearch was resolved to 1.27.5, which depends on
        json
```

— a *different gem each run* depending on install order, each time with the dependency
chain that pulled it in. Every signal says version resolution. The real cause is a
`Bundler::PermissionError` several lines above, which `| tail` hides. The tell is that
`gem install <the-named-gem> --user-install` succeeds immediately, because
`--user-install` writes somewhere else.

An earlier revision of this document concluded from those messages that Ruby 2.6 was too
old and that "pinning the offending gems one at a time does not converge." That was the
wrong diagnosis, and it is a seductive one: each pin genuinely does clear the gem it
names, so it feels like progress right up until you run out of gems. With `GEM_HOME` set,
the unpinned Gemfile resolves and builds all 41 gems on stock Ruby 2.6.10 in one pass.
Installing a current Ruby is still tidier long-term, but it is not required.

`ios/App/*` is a normal Xcode project and is committed, because it is where native
configuration lives — `Info.plist`, icons, entitlements. Only generated artifacts
under it are ignored: `App/Pods`, `App/App/public` (the copied web build),
`capacitor.config.json`, and `capacitor-cordova-ios-plugins`. See
[ios/.gitignore](../ios/.gitignore).

**Already configured, so you do not need to redo it in Xcode:**

| Setting | Value | Why |
| --- | --- | --- |
| Launch screen images | ROBOTAT lockup on `#05040c`, sRGB-tagged | The default was Capacitor's white placeholder. The storyboard's `imageView` is `scaleAspectFill` over the full screen, so **the images are what fixes the flash** — the storyboard's own background colour is never visible at all, since a square image aspect-filled onto a phone covers the view completely. Size artwork against the crop, not the canvas: on a 1206×2622 screen the scale is 2622/2732 = 0.96, so only the central ~1257px of the 2732 square reaches the glass |
| Webview background | `#05040c` | The second flash point: between the launch screen dismissing and React's first paint. Capacitor parses 8-digit hex here as RGBA, not ARGB |
| `UIUserInterfaceStyle` | `Dark` | The app has one theme and no `prefers-color-scheme` anywhere. Without this the *native* layer stays light on a light-mode device — keyboard, pickers, action sheets — and `prefers-color-scheme` inside the webview reports `light` |
| Status bar | `UIStatusBarStyleLightContent` with `UIViewControllerBasedStatusBarAppearance` **`true`** | Capacitor's `CAPBridgeViewController` reads `UIStatusBarStyle` from this plist and returns it from `preferredStatusBarStyle` — which is the view-controller path, so the key must stay `true`. Setting it `false` looks identical but silently turns `StatusBar.setStyle()` into a no-op if `@capacitor/status-bar` is ever added |
| Line endings | LF for `.pbxproj`/`.plist`/`.storyboard`/`.swift` | Repo is developed on Windows with `autocrlf=true`; see [.gitattributes](../.gitattributes) |

`#05040c` is what `--background: 253 53% 3%` in `client/src/index.css` actually
resolves to. If that token ever changes, these three native surfaces must change with it.

**The launch storyboard does not appear to render under `simctl launch`, and the startup
gap is mostly not the launch screen anyway.** Recording the simulator screen and pulling
frames with AVFoundation gives, from the launch command: ~1.6s black, ~1.2s empty webview
at `#05040c`, then content at ~3.4s. Setting the storyboard's background to red produced
no red in any frame, and no snapshot is written to the app's `Library/SplashBoard` even
though system apps get one — so the storyboard is not being drawn, rather than being drawn
and looking wrong. The build itself checks out: `assetutil --info` finds `Splash` in
`Assets.car` at 2732×2732, `Info.plist` carries `UILaunchStoryboardName`, and the compiled
`LaunchScreen.storyboardc` nib does reference the image. Untested on real hardware with an
icon tap, which is a different launch path.

What actually covers the gap today is the first-paint splash in
[client/index.html](../client/index.html): the lockup inlined as a data URI, removed by
`main.tsx` once React renders. It only reaches the screen once the webview has parsed the
document (~2.8s in), so it fixes the tail of the wait, not the head. Closing the rest means
`@capacitor/splash-screen` with `launchAutoHide: false`, held until the app calls `hide()`.

Two things make measuring this harder than it should be. `xcrun simctl io screenshot` takes
~0.3s per frame, which is too coarse — record video and extract frames instead; there is no
`ffmpeg` here, but `swiftc` plus `AVAssetImageGenerator` does the job. And a `CGImage` from
that generator is **BGRA**, so reading bytes as RGB silently swaps red and blue and makes
`#05040c` look red-dominant.

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
VITE_API_URL=https://www.robotat.sa npm run build
npx cap copy ios      # push the fresh web build into the native project
npx cap open ios      # opens Xcode → run on a simulator or a signed device
```

Use `npx cap sync ios` (instead of `copy`) whenever native dependencies change.

## Native dependencies (done 2026-08-18)

Both native plugins are installed, wired and building. `pod install` reports
`@capacitor/push-notifications@7.0.7` and `capacitor-secure-storage-plugin@0.12.0`, and a
Release build embeds `CapacitorPushNotifications.framework`,
`CapacitorSecureStoragePlugin.framework` and `SwiftKeychainWrapper.framework`.

- **Native push (APNs).** `client/src/lib/push.ts` needed no edit, exactly as designed —
  it binds the plugin by name via `registerPlugin('PushNotifications')`, so installing the
  package only supplied the native half.

  The `aps-environment` entitlement is **split across two files**:
  [`App.entitlements`](../ios/App/App/App.entitlements) (`development`) for Debug and
  [`AppRelease.entitlements`](../ios/App/App/AppRelease.entitlements) (`production`) for
  Release, selected by `CODE_SIGN_ENTITLEMENTS` per build configuration. Xcode's Organizer
  does rewrite that key on export, but that is behaviour rather than a contract — it does
  not apply to a plain `xcodebuild archive`, and a token minted in the wrong APNs
  environment fails by having notifications silently never arrive. Making it a build
  setting removes the dependence on an export step.

- **Secure token storage.** `capacitor-secure-storage-plugin` is pinned to **0.12.x**:
  0.13 raised its peer dependency to Capacitor 8 and this project is on 7. npm installs it
  anyway and the mismatch only shows up as a native crash on device.

  Registered in `client/src/main.tsx` via `installTokenPersistence()`, behind
  `Capacitor.isNativePlatform()` and a dynamic `import()` — the plugin's *web* fallback is
  `localStorage`, which is the one store `token-persistence.ts` exists to avoid. The lazy
  import keeps it out of the web bundle rather than merely unused inside it.

Still pending, and needs the Apple Developer portal: create an **APNs key**, download the
`.p8` once, and set `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY` (the `.p8` contents,
newlines as `\n`), `APNS_BUNDLE_ID` (defaults to `com.nasl.robotat`) and
**`APNS_ENV=production`** on Railway. That last one must agree with
`AppRelease.entitlements`; the server default is the sandbox, which only matches a Debug
build. With them unset push is switched off and status changes are logged instead, so
nothing breaks.

## App Store readiness

Verified against a real `xcodebuild archive`, not by inspection:

| Item | State |
| --- | --- |
| Apple Developer Program | ✅ **NASL TECHNOLOGY COMPANY**, team `889N48X22R` (an organization team) |
| Release build | ✅ `** BUILD SUCCEEDED **`, 5.5 MB, `com.nasl.robotat` 1.0 (1) |
| App icon | ✅ 1024×1024, `hasAlpha: no` |
| Privacy policy URL | ✅ `https://www.robotat.sa/privacy` serves 200 |
| In-app account deletion | ✅ `DELETE /api/auth/account`, re-auths and anonymises |
| Privacy manifest | ✅ [`PrivacyInfo.xcprivacy`](../ios/App/App/PrivacyInfo.xcprivacy), copied to the bundle root |
| Export compliance | ✅ `ITSAppUsesNonExemptEncryption = false` in `Info.plist` |
| Device family | ✅ `UIDeviceFamily = [1]` — iPhone only for v1 |
| Distribution certificate | ❌ none on this Mac (`security find-identity` finds 0 `Apple Distribution`) |

**Blocker: the Program License Agreement is unsigned.** Any provisioning change fails with

```
error: Unable to process request - PLA Update available: You currently don't have access
to this membership resource. To resolve this issue, agree to the latest Program License
Agreement in your developer account.
```

Only the **Account Holder** can clear it, at
[developer.apple.com/account](https://developer.apple.com/account) → Review Agreement.
Until then Xcode cannot register the App ID, enable Push Notifications on it, or issue any
profile — and nothing can be uploaded to App Store Connect either. Worth checking first
whenever signing suddenly breaks, because the surface error is about a provisioning
profile and points nowhere near the cause: building with `CODE_SIGNING_ALLOWED=NO`
succeeds throughout, which is how you tell this apart from a real build problem.

Remaining after that: distribution certificate, App Store Connect app record, screenshots,
privacy labels (must match `PrivacyInfo.xcprivacy` and `Privacy.tsx`), age rating, and a
**demo account in the App Review notes** — the app is behind a login wall, and omitting
credentials is an automatic rejection. Then TestFlight, then submit.

**App polish** still open: offline states. (Icon, launch screen and dark appearance are
done — see the table above.)

## Config reference

| Setting | Value | Where |
| --- | --- | --- |
| App ID (bundle id) | `com.nasl.robotat` | `capacitor.config.ts` |
| App name | `ROBOTAT` | `capacitor.config.ts` |
| Web assets | `dist/public` | `capacitor.config.ts` → `webDir` |
| API origin (native) | `VITE_API_URL` at build time | `.env` / build env |
