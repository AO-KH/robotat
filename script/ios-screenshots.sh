#!/bin/bash
#
# Capture the App Store screenshot set from the iOS Simulator.
#
#   script/ios-screenshots.sh            capture every scene
#   script/ios-screenshots.sh 03         capture only the scene numbered 03
#
# Output: screenshots/ios-6.9/*.png at 1320x2868 — the 6.9-inch size App Store
# Connect asks for. The target is iPhone-only (TARGETED_DEVICE_FAMILY = 1), so
# this one set covers the whole submission; Apple scales it down for smaller
# devices and no iPad set is required.
#
# ---------------------------------------------------------------------------
# Why this drives the app the way it does
#
# `xcrun simctl` can install, launch and screenshot, but it has NO tap or swipe
# command, and driving the Simulator window with the desktop automation tools
# needs a Screen Recording grant this machine does not have. So instead of
# poking the UI from outside, each scene injects a script into the *installed*
# bundle's index.html and relaunches:
#
#   * The route is set with history.replaceState BEFORE the module script runs.
#     wouter reads location.pathname when it initialises, so the app renders
#     that route directly — no synthetic navigation, no router internals.
#
#   * Scrolls and taps run against real elements once React has painted. The
#     product cards and the booking button are genuine <button>s, so tap() is
#     the same code path a finger takes. What lands in the PNG is the real
#     screen, not a mock.
#
# The edit is made to the copy inside the simulator's app container. The repo's
# dist/public, ios/App/App/public and the uploaded archive are never touched,
# and the container copy is restored on exit.
#
# The readiness poll is the fiddly part. `load` fires long before React mounts —
# at that moment the document is still one screen tall, so a scrollTo silently
# does nothing and every scene comes out at offset 0. The poll instead waits for
# #root to have children and the #splash element to be gone. A cold launch on
# this simulator takes ~30s to reach that point, which is why SETTLE is what it
# is; it is not a guess padded for safety.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

DEVICE="${SIM_DEVICE:-iPhone 17 Pro Max}"
BUNDLE_ID="com.nasl.robotat"
OUTDIR="screenshots/ios-6.9"
DD="/tmp/robotat-sim-dd"
SETTLE="${SETTLE:-34}"
ONLY="${1:-}"

# scene := number | name | route | afterJS | settle?
#
# afterJS runs after first paint with these helpers in scope:
#   sec(n)      scroll to the nth <section>, clearing the sticky header
#   byText(re)  first <button>/<a> whose trimmed text matches
#   tap(el)     centre it and click it
#   fill(el,v)  set a React-controlled input's value so React sees the change
#
# settle overrides $SETTLE for that one scene. Only the dashboard needs it: every
# other scene is painted by the time afterJS runs, whereas that one still has a
# sign-in round trip to production and a second query ahead of it.
#
# afterJS must not contain a literal "|" — it is the field separator.
#
# Fleet has no <section> elements, so its scenes anchor on content instead.
SCENES=(
  "01|home|/|"
  "02|products|/fleet|"
  # The detail sheet leaves a strip of the page showing above it. Left at scroll
  # 0 that strip is the page's own <h1>, which collides with the status bar and
  # reads as a rendering bug. Scrolling first puts dimmed card artwork up there
  # instead. click() directly rather than tap() — tap() centres the element,
  # which would undo the scroll. Throws rather than skipping if the card is not
  # found: the previous `if(b)` swallowed a miss, so after the platform was
  # renamed this step still produced a file called product-detail — of the
  # wrong screen — and a silently wrong App Store screenshot is worse than a
  # failed run. Matches both scripts because the page follows the locale.
  "03|product-detail|/fleet|scrollTo({top:1760,behavior:'instant'});var b=byText(/Shaddad|شداد/);if(!b)throw new Error('product card not found');b.click();"
  "04|services|/services|"
  "05|environments|/|var s=document.querySelectorAll('section')[3];scrollTo({top:s.getBoundingClientRect().top+scrollY-18,behavior:'instant'});"
  "06|book-assessment|/|tap(byText(/Book a site assessment/i));"
  "07|sign-in|/auth|"
  # Signs in as the App Review demo account (APP_STORE.md §5) and lands on the
  # dashboard it redirects to. Driving the real form rather than planting a token:
  # the bearer token lives in a module-scoped variable in client/src/lib/auth-token.ts
  # and is deliberately unreachable from page script, so there is nothing to plant.
  # That makes this scene a live test of the demo credentials as well as a shot —
  # if it comes out on the sign-in screen, the account is broken and so is the
  # submission.
  "08|dashboard|/auth|var f=document.querySelector('form');fill(f.querySelector('input[type=email]'),'appreview@robotat.sa');fill(f.querySelector('input[type=password]'),'S24Z-P6J5-RH5E-65MV');f.requestSubmit();|52"
)

say() { printf '\033[1;35m==>\033[0m %s\n' "$*"; }

# --- simulator -------------------------------------------------------------

UDID=$(xcrun simctl list devices available \
  | grep -F "$DEVICE (" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
[ -n "$UDID" ] || { echo "no available simulator named '$DEVICE'" >&2; exit 1; }

# Reboot rather than reuse a booted device. An iOS permission alert is presented by
# SpringBoard, not by the app, so terminating the app does not take it down: one
# unanswered "would like to send you notifications" survives every later launch and
# lands in the middle of every later screenshot. There is no way to answer it —
# simctl has no tap — and nothing on screen says it is a leftover rather than
# something the current run caused, which makes it look like whatever you just
# changed did not work. Three rebuilds were spent on that; a boot is cheaper.
xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
xcrun simctl boot "$UDID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || true
say "simulator $DEVICE ($UDID)"

# --- build + install -------------------------------------------------------

BUILT="$DD/Build/Products/Debug-iphonesimulator/App.app"

if [ ! -d "$BUILT" ]; then
  say "building for the simulator (CODE_SIGNING_ALLOWED=NO — this build is never shipped)"
  xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
    -configuration Debug -sdk iphonesimulator \
    -destination "platform=iOS Simulator,id=$UDID" \
    -derivedDataPath "$DD" CODE_SIGNING_ALLOWED=NO build >/dev/null
fi

# Always re-copy the web bundle over the cached build, because the cache above is
# keyed on nothing at all: it reuses whatever App.app is in /tmp regardless of how
# old the public/ inside it is. That is not hypothetical — the first screenshot set
# was captured from a bundle two builds stale, missing the Support link and, had
# the dashboard scene existed then, missing VITE_API_URL, so the sign-in would have
# failed against capacitor://localhost with nothing on screen to say why.
#
# Native code changes about once a quarter; the web bundle changes several times a
# day. Keeping the expensive xcodebuild cached and refreshing the cheap part every
# run is the split that matches how the two actually move.
say "refreshing the web bundle in the cached build"
rm -rf "$BUILT/public"
cp -R ios/App/App/public "$BUILT/public"

xcrun simctl install "$UDID" "$BUILT"

# The demo account's token is persisted to the Keychain by the secure-storage
# plugin, so scene 08 leaves the simulator signed in and a later run would find
# scene 07 (/auth) redirecting straight to the dashboard — a sign-in screenshot
# with no sign-in form on it. Reinstalling does not clear the Keychain; this does.
xcrun simctl keychain "$UDID" reset >/dev/null 2>&1 || true

APP=$(xcrun simctl get_app_container "$UDID" "$BUNDLE_ID")
IDX="$APP/public/index.html"
[ -f "$IDX.orig" ] || cp "$IDX" "$IDX.orig"

restore() {
  cp "$IDX.orig" "$IDX" 2>/dev/null || true
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl status_bar "$UDID" clear >/dev/null 2>&1 || true
}
trap restore EXIT

# The carrier/battery/clock the marketing shots want, not whatever the host Mac
# happens to show. Apple's own convention is 9:41.
xcrun simctl status_bar "$UDID" override \
  --time "9:41" --batteryState discharging --batteryLevel 100 \
  --cellularMode active --cellularBars 4 --wifiMode active --wifiBars 3 \
  --dataNetwork wifi

# --- capture ---------------------------------------------------------------

mkdir -p "$OUTDIR"

for scene in "${SCENES[@]}"; do
  IFS='|' read -r num name route after settle <<<"$scene"
  [ -z "$ONLY" ] || [ "$ONLY" = "$num" ] || continue

  wait_for="${settle:-$SETTLE}"
  out="$OUTDIR/$num-$name.png"
  say "$num $name  ($route, ${wait_for}s)"

  ROUTE="$route" AFTER="$after" IDX="$IDX" node -e '
    const fs = require("fs");
    const idx = process.env.IDX;
    const html = fs.readFileSync(idx + ".orig", "utf8");
    const inject = `<script>
history.replaceState({}, "", ${JSON.stringify(process.env.ROUTE)});
/*
  Hide the push plugin from the webview, so signing in does not raise the iOS
  "would like to send you notifications" alert over the shot. Without this the
  dashboard scene captures the alert and almost nothing else, and there is no way
  to dismiss it — simctl has no tap, and answering it by hand is not something a
  script can rely on.

  Removing the entry from PluginHeaders rather than stubbing the plugin object,
  because that is the exact switch Capacitor itself reads: registerPlugin() looks
  the name up there to decide whether a native implementation exists (see
  createCapacitor in @capacitor/core). Dropping it puts the webview in the same
  state as a device where the pod is not installed, which initPush already treats
  as a supported outcome — client/src/lib/push.ts catches and logs, sign-in
  continues.

  Patching push() rather than filtering the array once, because filtering once is
  not enough and fails silently when it is not: each plugin is injected by its own
  generated script that does PluginHeaders.push(...), and PushNotifications lands
  AFTER this file. A one-shot filter runs against an array that does not contain it
  yet, removes nothing, and the entry arrives immediately afterwards — the alert
  still appears and nothing anywhere says why. Rejecting the entry at push() covers
  both orderings, and the array identity is preserved so the later scripts, which
  re-read PluginHeaders rather than rebinding it, keep the patched copy.

  Do not reassign window.Capacitor here. The bundle calls createCapacitor(window),
  which seeds from the existing object but then unconditionally overwrites
  registerPlugin, isNativePlatform and the rest — anything hung off those is lost.
  PluginHeaders is the one field it leaves alone, which is why the switch is here.

  Keep apostrophes out of this comment. The whole block is a single-quoted shell
  string, so one of them ends it and bash reports a syntax error tens of lines
  further down, nowhere near the cause.

  Unconditional rather than opt-in per scene: this has to run before the module
  script, which is earlier than afterJS can reach, and no other scene signs in,
  so nothing else is affected either way.
*/
try {
  var cap = (window.Capacitor = window.Capacitor || {});
  var hdrs = (cap.PluginHeaders = cap.PluginHeaders || []);
  var blocked = function (h) { return !!h && h.name === "PushNotifications"; };
  for (var i = hdrs.length - 1; i >= 0; i--) {
    if (blocked(hdrs[i])) hdrs.splice(i, 1);
  }
  var realPush = Array.prototype.push;
  hdrs.push = function () {
    var keep = [].slice.call(arguments).filter(function (h) { return !blocked(h); });
    return keep.length ? realPush.apply(this, keep) : this.length;
  };
} catch (e) {}
function sec(n) {
  var s = document.querySelectorAll("section")[n];
  if (s) scrollTo({ top: s.getBoundingClientRect().top + scrollY - 76, behavior: "instant" });
}
function byText(re) {
  return [].slice.call(document.querySelectorAll("button, a"))
    .filter(function (e) { return re.test((e.textContent || "").trim()); })[0];
}
function tap(el) {
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "instant" });
  el.click();
}
// Assigning el.value directly is invisible to React: it patches the value setter
// on the element instance, so its own bookkeeping never sees the write and the
// form submits empty. Calling the prototype setter and dispatching a bubbling
// "input" event is the sequence React does recognise.
function fill(el, v) {
  if (!el) return;
  var set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
  set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
(function ready(cb) {
  var n = 0;
  var t = setInterval(function () {
    var r = document.getElementById("root");
    if ((r && r.children.length && !document.getElementById("splash")) || ++n > 240) {
      clearInterval(t);
      setTimeout(cb, 900);
    }
  }, 250);
})(function () {
  try { ${process.env.AFTER || "/* no-op */"} } catch (e) { console.error("afterJS", e); }
});
</script>`;
    const marker = "<script type=\"module\"";
    if (!html.includes(marker)) throw new Error("module script tag not found in index.html");
    fs.writeFileSync(idx, html.replace(marker, inject + "\n" + marker));
  '

  xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null
  sleep "$wait_for"

  # simctl writes to a temp path, not straight to $OUTDIR. If the repo lives
  # under ~/Documents (or Desktop/Downloads) macOS refuses simctl the write with
  # a TCC "You don't have permission" error — simctl is a different binary from
  # the shell and carries no Files-and-Folders grant. The shell itself can write
  # there, so capture outside and move in.
  tmp=$(mktemp -t robotat-shot).png
  xcrun simctl io "$UDID" screenshot --type=png "$tmp" >/dev/null 2>&1
  mv "$tmp" "$out"
done

# --- optimise --------------------------------------------------------------
#
# Straight off the simulator these are 3-4 MB each, which is far out of step
# with everything else in the repo. Re-encoding is lossless — same pixels, same
# dimensions, no alpha introduced (App Store Connect rejects screenshots that
# carry an alpha channel).
say "optimising"
node -e '
const sharp = require("sharp"), fs = require("fs");
const dir = process.argv[1];
(async () => {
  let before = 0, after = 0;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".png"))) {
    const p = `${dir}/${f}`;
    const b = fs.statSync(p).size;
    const buf = await sharp(p).png({ compressionLevel: 9, effort: 10 }).toBuffer();
    if (buf.length < b) fs.writeFileSync(p, buf);
    const m = await sharp(p).metadata();
    if (m.hasAlpha) throw new Error(`${f} has an alpha channel; App Store Connect will reject it`);
    before += b; after += fs.statSync(p).size;
    console.log(`  ${f.padEnd(24)} ${m.width}x${m.height}  ${(fs.statSync(p).size / 1048576).toFixed(2)} MB`);
  }
  console.log(`  total ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
})();
' "$OUTDIR"

say "done — $OUTDIR"
