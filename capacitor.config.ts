import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the built React client (webDir) in a native iOS shell.
 * The client is bundled into the app — it is NOT a webview pointed at the live
 * site — so the app hits the deployed API via VITE_API_URL (see client/src/lib/
 * api-base.ts) and satisfies App Store Guideline 4.2 with native push, etc.
 *
 * The `ios/` project already exists and is committed. Do NOT run `npx cap add ios`
 * again — it would overwrite the launch screen, status bar and appearance settings
 * configured there. Building and signing still require a Mac; see docs/IOS.md.
 */
const config: CapacitorConfig = {
  appId: "com.nasl.robotat",
  appName: "ROBOTAT",
  webDir: "dist/public",
  ios: {
    // Inset the webview for the safe area, so content never sits under the status bar
    // or the home indicator. ("never" would be the opposite — content edge to edge.)
    contentInset: "always",

    // The webview's own background, shown between the launch screen dismissing and
    // React's first paint. Left at the default white it flashes on an app this dark —
    // the most obvious "wrapped website" tell on launch.
    //
    // This is #05040c, which is what `--background: 253 53% 3%` in client/src/index.css
    // actually resolves to. Capacitor parses 8-digit hex here as RGBA, not ARGB.
    backgroundColor: "#05040cff",
  },
};

export default config;
