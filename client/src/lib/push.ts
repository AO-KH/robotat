import { Capacitor, registerPlugin } from "@capacitor/core";
import { navigate } from "wouter/use-browser-location";
import { api } from "@shared/routes";

/**
 * Native push registration for the iOS shell.
 *
 * Two halves, and the second is the one that matters. `initPush` asks for permission,
 * hands the device's APNs token to the backend so status changes can reach the phone,
 * and routes a tap on one of those notifications to the booking it is about.
 * `teardownPush` gives the token back on sign-out.
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

/** What a tap on a notification hands back. `data` is the APNs payload's custom keys. */
interface PushAction {
  notification?: { data?: Record<string, unknown> | null } | null;
}

/** The slice of Capacitor's PushNotifications plugin this module uses. */
interface PushPlugin {
  checkPermissions(): Promise<{ receive: PermissionState }>;
  requestPermissions(): Promise<{ receive: PermissionState }>;
  register(): Promise<void>;
  addListener(event: "registration", fn: (token: { value: string }) => void): Promise<unknown>;
  addListener(event: "registrationError", fn: (err: { error: string }) => void): Promise<unknown>;
  addListener(
    event: "pushNotificationActionPerformed",
    fn: (action: PushAction) => void,
  ): Promise<unknown>;
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
 * Open the booking a notification is about.
 *
 * `buildApnsPayload` ships `assessmentId` alongside the alert precisely so a tap can
 * land somewhere useful — the cancelled-booking copy says "Tap to get in touch", and
 * without this it opened the app wherever it happened to be.
 *
 * Navigating from module scope: this file is not a component, so there is no
 * `useLocation` to reach for. wouter's `navigate` is the same function that hook's
 * second element returns — it calls `history.pushState`, and wouter patches pushState at
 * import time to emit an event its `useSyncExternalStore` subscribers listen to, so the
 * router re-renders exactly as it would from a `<Link>`. `window.location.href` would
 * also arrive at the right URL, but by reloading the whole app: a fresh bundle parse and
 * a cold TanStack Query cache, which on a phone is a visible stall on every tap.
 *
 * Anything unparseable is dropped rather than turned into a URL. A malformed id would
 * navigate to `/assessments/undefined`, which matches the route and renders its
 * not-found state — a worse outcome than simply opening where the user left off.
 */
function openAssessment(action: PushAction): void {
  const raw = action?.notification?.data?.assessmentId;
  // APNs custom keys survive as JSON, but iOS has handed these back as strings before,
  // so accept either and insist only that it is a positive integer.
  const id = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(id) || id <= 0) {
    console.warn("[push] notification carried no usable assessment id", raw);
    return;
  }
  navigate(`/assessments/${id}`);
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
      try {
        await push.addListener("registration", (token) => {
          void sendToken(token.value);
        });
        await push.addListener("registrationError", (err) => {
          // APNs can refuse for reasons no user action fixes (no entitlement, no
          // network, a simulator without a push profile). Sign-in must not notice.
          console.warn("[push] APNs registration failed", err?.error ?? err);
        });
        await push.addListener("pushNotificationActionPerformed", openAssessment);
      } catch (err) {
        /*
          The latch must not outlive a failed binding.

          Left `true`, the next `initPush` would skip straight past this block to
          `register()` — and the `registration` event would then fire with nothing
          listening, losing the device token for the life of the process with no error
          anywhere. Clearing it costs one repeated bind attempt; keeping it costs push.
        */
        listenersBound = false;
        throw err;
      }
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
 *
 * The token is only forgotten once the server confirms it is gone. This is the same
 * argument `sendToken` makes, pointing the other way: dropping it on a failed release
 * means a sign-out with no connectivity permanently forgets the one token this device
 * was responsible for, and nothing can ever retry. Sign out on a train, hand the phone
 * over, and the row keeps naming the previous user until some other account happens to
 * register the same device. Keeping it costs one repeated unregister; losing it costs a
 * stranger the user's booking details.
 */
export async function teardownPush(): Promise<void> {
  const token = registeredToken;
  // Cleared up front so a second call — or a concurrent one — cannot re-send it. Put
  // back below if the release did not actually land.
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
      keepForRetry(token);
    }
  } catch (err) {
    console.warn("[push] could not release this device from notifications", err);
    keepForRetry(token);
  }
}

/**
 * Restore a token whose release failed, so a later `teardownPush` can try again.
 *
 * Guarded on the slot still being empty: if a fresh sign-in registered a new token while
 * this request was in flight, that one is now the device's token and must not be
 * clobbered by the stale value we were trying to get rid of.
 */
function keepForRetry(token: string): void {
  if (registeredToken === null) registeredToken = token;
}

/** Test seam: forget the registered token and unbind the listener latch. */
export function resetPushForTests(): void {
  registeredToken = null;
  listenersBound = false;
}
