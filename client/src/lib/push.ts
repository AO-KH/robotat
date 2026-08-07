import { Capacitor, registerPlugin } from "@capacitor/core";
import { api } from "@shared/routes";

/**
 * Native push registration for the iOS shell.
 *
 * Two halves, and the second is the one that matters. `initPush` asks for permission
 * and hands the device's APNs token to the backend so status changes can reach the
 * phone. `teardownPush` gives it back on sign-out.
 *
 * Without the second half the app leaks: `push_tokens.token` is globally UNIQUE and its
 * row is only ever re-pointed when a *different* account registers the same token. A
 * phone that simply signs out and is handed to someone else never re-registers, so the
 * row keeps naming the previous user and the next booking status change delivers their
 * site address and notes to whoever now holds the device. Registration alone does not
 * close that; releasing the token on sign-out does.
 *
 * ## Why there is no `@capacitor/push-notifications` import here
 *
 * The plugin's JavaScript half is a one-liner — `registerPlugin('PushNotifications')`
 * from `@capacitor/core`, which is already a dependency. Binding by name gives the same
 * object without adding a package this machine cannot build or verify, and it keeps the
 * name out of the web bundle entirely. The Mac still needs
 * `npm install @capacitor/push-notifications && npx cap sync ios` for the *native* pod;
 * see docs/IOS.md. No edit to this file is required when that lands.
 *
 * Nothing in here may throw at a caller. Push is a nicety layered on top of sign-in and
 * sign-out, and neither of those may fail because a notification could not be arranged.
 */

type PermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";

/** The slice of Capacitor's PushNotifications plugin this module uses. */
interface PushPlugin {
  checkPermissions(): Promise<{ receive: PermissionState }>;
  requestPermissions(): Promise<{ receive: PermissionState }>;
  register(): Promise<void>;
  addListener(event: "registration", fn: (token: { value: string }) => void): Promise<unknown>;
  addListener(event: "registrationError", fn: (err: { error: string }) => void): Promise<unknown>;
}

/**
 * The token this device last handed to the backend, and therefore the one it is
 * responsible for releasing. Module state rather than a store because it is not UI and
 * nothing renders from it; `resetPushForTests` is the seam, following `auth-token.ts`.
 */
let registeredToken: string | null = null;

/** Listeners are process-wide and `initPush` runs on every sign-in, so bind them once. */
let listenersBound = false;

/**
 * Send the device token to the backend.
 *
 * `registeredToken` is set *before* the request, not after a 200. If the POST reaches
 * the server and the response is lost on the way back, the row exists and this device
 * is the only thing that knows to remove it — forgetting the token in that case would
 * strand exactly the row this module exists to clean up. Remembering a token the server
 * never stored costs one harmless unregister call; the reverse costs a stranger the
 * user's booking details.
 */
async function sendToken(token: string): Promise<void> {
  registeredToken = token;
  try {
    const res = await fetch(api.push.register.path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(api.push.register.input.parse({ token, platform: "ios" })),
    });
    if (!res.ok) {
      console.warn("[push] the server refused this device token", res.status);
    }
  } catch (err) {
    console.warn("[push] could not register this device for notifications", err);
  }
}

/**
 * Ask for permission and register this device. Safe to call repeatedly — on every
 * sign-in, and on boot when a session is already restored.
 *
 * Returns immediately on the web. The guard runs before anything reaches for the
 * plugin, so a browser never so much as looks for a native implementation.
 */
export async function initPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const push = registerPlugin<PushPlugin>("PushNotifications");

    let status = await push.checkPermissions();
    if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
      status = await push.requestPermissions();
    }
    if (status.receive !== "granted") {
      // Not an error. Declining notifications is a supported way to use the app, and
      // Apple expects it to be handled as one.
      console.info("[push] notifications are not permitted on this device");
      return;
    }

    if (!listenersBound) {
      // Set before awaiting: two overlapping `initPush` calls must not each bind a
      // listener, or one token would be POSTed twice.
      listenersBound = true;
      await push.addListener("registration", (token) => {
        void sendToken(token.value);
      });
      await push.addListener("registrationError", (err) => {
        // APNs can refuse for reasons no user action fixes (no entitlement, no
        // network, a simulator without a push profile). Sign-in must not notice.
        console.warn("[push] APNs registration failed", err?.error ?? err);
      });
    }

    await push.register();
  } catch (err) {
    console.warn("[push] could not set up notifications", err);
  }
}

/**
 * Release this device's push token. Call on sign-out, *before* the session is torn
 * down — the endpoint is behind `requireAuth`, so an unregister sent after the logout
 * request has destroyed the session (or after the bearer token is cleared) answers 401
 * and leaves the row in place, which is the whole hazard.
 *
 * Never throws: a failed release must not block sign-out. It is logged rather than
 * swallowed, because this is the privacy-relevant path and a silent failure is exactly
 * how a stale row survives unnoticed.
 */
export async function teardownPush(): Promise<void> {
  const token = registeredToken;
  // Cleared up front so a second call — or a concurrent one — cannot re-send it.
  registeredToken = null;
  if (!token) return;

  try {
    const res = await fetch(api.push.unregister.path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(api.push.unregister.input.parse({ token })),
    });
    if (!res.ok) {
      console.warn("[push] the server did not release this device", res.status);
    }
  } catch (err) {
    console.warn("[push] could not release this device from notifications", err);
  }
}

/** Test seam: forget the registered token and unbind the listener latch. */
export function resetPushForTests(): void {
  registeredToken = null;
  listenersBound = false;
}
