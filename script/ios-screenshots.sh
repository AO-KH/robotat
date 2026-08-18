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

# scene := number | route | afterJS
#
# afterJS runs after first paint with these helpers in scope:
#   sec(n)      scroll to the nth <section>, clearing the sticky header
#   byText(re)  first <button>/<a> whose trimmed text matches
#   tap(el)     centre it and click it
#
# Fleet has no <section> elements, so its scenes anchor on content instead.
SCENES=(
  "01|home|/|"
  "02|products|/fleet|"
  # The detail sheet leaves a strip of the page showing above it. Left at scroll
  # 0 that strip is the page's own <h1>, which collides with the status bar and
  # reads as a rendering bug. Scrolling first puts dimmed card artwork up there
  # instead. click() directly rather than tap() — tap() centres the element,
  # which would undo the scroll.
  "03|product-detail|/fleet|scrollTo({top:1760,behavior:'instant'});var b=byText(/MAX T100/);if(b)b.click();"
  "04|services|/services|"
  "05|environments|/|var s=document.querySelectorAll('section')[3];scrollTo({top:s.getBoundingClientRect().top+scrollY-18,behavior:'instant'});"
  "06|book-assessment|/|tap(byText(/Book a site assessment/i));"
  "07|sign-in|/auth|"
)

say() { printf '\033[1;35m==>\033[0m %s\n' "$*"; }

# --- simulator -------------------------------------------------------------

UDID=$(xcrun simctl list devices available \
  | grep -F "$DEVICE (" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
[ -n "$UDID" ] || { echo "no available simulator named '$DEVICE'" >&2; exit 1; }

xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || xcrun simctl boot "$UDID"
say "simulator $DEVICE ($UDID)"

# --- build + install -------------------------------------------------------

if [ ! -d "$DD/Build/Products/Debug-iphonesimulator/App.app" ]; then
  say "building for the simulator (CODE_SIGNING_ALLOWED=NO — this build is never shipped)"
  xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
    -configuration Debug -sdk iphonesimulator \
    -destination "platform=iOS Simulator,id=$UDID" \
    -derivedDataPath "$DD" CODE_SIGNING_ALLOWED=NO build >/dev/null
fi

xcrun simctl install "$UDID" "$DD/Build/Products/Debug-iphonesimulator/App.app"

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
  IFS='|' read -r num name route after <<<"$scene"
  [ -z "$ONLY" ] || [ "$ONLY" = "$num" ] || continue

  out="$OUTDIR/$num-$name.png"
  say "$num $name  ($route)"

  ROUTE="$route" AFTER="$after" IDX="$IDX" node -e '
    const fs = require("fs");
    const idx = process.env.IDX;
    const html = fs.readFileSync(idx + ".orig", "utf8");
    const inject = `<script>
history.replaceState({}, "", ${JSON.stringify(process.env.ROUTE)});
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
  sleep "$SETTLE"

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
