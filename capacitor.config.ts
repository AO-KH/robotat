import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the built React client (webDir) in a native iOS shell.
 * The client is bundled into the app — it is NOT a webview pointed at the live
 * site — so the app hits the deployed API via VITE_API_URL (see client/src/lib/
 * api-base.ts) and satisfies App Store Guideline 4.2 with native push, etc.
 *
 * The iOS project itself (`npx cap add ios`) must be generated and built on a
 * Mac with Xcode — see docs/IOS.md.
 */
const config: CapacitorConfig = {
  appId: "com.nasl.robotat",
  appName: "ROBOTAT",
  webDir: "dist/public",
  ios: {
    // Let content flow under the status bar; the app handles safe-area insets.
    contentInset: "always",

    // The webview's own background, shown between the launch screen dismissing and
    // React's first paint. Left at the default white it produces a flash on a site
    // whose background is #06040d — the single most obvious "this is a wrapped
    // website" tell on launch. Matches --background in client/src/index.css, and
    // the launch screen, so the whole startup sequence is one continuous colour.
    backgroundColor: "#06040dff",
  },
};

export default config;
