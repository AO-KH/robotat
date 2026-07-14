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
  },
};

export default config;
