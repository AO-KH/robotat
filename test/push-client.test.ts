import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The client half of native push.
 *
 * The load-bearing case is `teardownPush`: `push_tokens.token` is UNIQUE and a row is
 * only ever re-pointed when a *different* account registers the same token, so a phone
 * that signs out and is handed on never re-registers and the row keeps naming the
 * previous user. Everything else here is scaffolding for that one guarantee.
 *
 * Vitest runs in `environment: "node"` with no jsdom, so this exercises the module
 * directly rather than through React. `@capacitor/core` is mocked — `isNativePlatform`
 * is the switch the whole module hangs off, and `registerPlugin` stands in for a native
 * plugin that cannot exist off a device.
 */

const cap = vi.hoisted(() => ({
  native: false,
  /** Plugin names `registerPlugin` was asked for. Empty proves the web path never looked. */
  pluginsRequested: [] as string[],
  permission: "granted" as string,
  listeners: {} as Record<string, (arg: unknown) => void>,
  registerCalls: 0,
  /** When set, `addListener` rejects with it — the binding-fails path. */
  addListenerError: null as Error | null,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => cap.native },
  registerPlugin: (name: string) => {
    cap.pluginsRequested.push(name);
    return {
      checkPermissions: async () => ({ receive: cap.permission }),
      requestPermissions: async () => ({ receive: cap.permission }),
      register: async () => {
        cap.registerCalls += 1;
      },
      addListener: async (event: string, fn: (arg: unknown) => void) => {
        if (cap.addListenerError) throw cap.addListenerError;
        cap.listeners[event] = fn;
      },
    };
  },
}));

const { initPush, teardownPush, resetPushForTests } = await import("@/lib/push");

const DEVICE = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

let calls: Array<{ url: string; body: unknown }>;
let respond: () => Response | Promise<Response>;
let pushState: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetPushForTests();
  cap.native = false;
  cap.pluginsRequested = [];
  cap.permission = "granted";
  cap.listeners = {};
  cap.registerCalls = 0;
  cap.addListenerError = null;

  // wouter's `navigate` is History-API only, and this suite runs in `environment: "node"`
  // where there is no `history` at all. Standing one in is enough: pushState *is* the
  // navigation, and wouter's own event patch is what turns it into a re-render.
  pushState = vi.fn();
  vi.stubGlobal("history", { pushState, replaceState: vi.fn() });

  calls = [];
  respond = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  vi.stubGlobal("fetch", (async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return respond();
  }) as unknown as typeof fetch);

  // The module logs on every path it declines to throw on; keep the run readable.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Take the app through a real native registration so a token is actually stored. */
async function registerDevice(token = DEVICE) {
  cap.native = true;
  await initPush();
  cap.listeners.registration({ value: token });
  await new Promise((r) => setTimeout(r, 0)); // the listener fires the POST detached
}

describe("initPush", () => {
  it("does nothing at all on the web — no plugin, no network", async () => {
    cap.native = false;

    await initPush();

    // If this ever fails, the web bundle is reaching for a native plugin that is not
    // there, which is also how the plugin's name ends up in dist/public.
    expect(cap.pluginsRequested).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("binds to the plugin by its exact registered name", async () => {
    await registerDevice();

    // The string is the entire native contract. There is no `@capacitor/push-notifications`
    // import to typo-check it against — `registerPlugin` happily returns a proxy for a
    // name nothing implements, so a mistake here is a silent no-op that only a device
    // would ever surface. Also asserts it is asked for once, not once per listener.
    expect(cap.pluginsRequested).toEqual(["PushNotifications"]);
  });

  it("registers the device token with the backend on a native platform", async () => {
    await registerDevice();

    expect(cap.registerCalls).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/push/register");
    expect(calls[0].body).toEqual({ token: DEVICE, platform: "ios" });
  });

  it("treats a refused permission as a normal outcome, not an error", async () => {
    cap.native = true;
    cap.permission = "denied";

    await expect(initPush()).resolves.toBeUndefined();
    expect(cap.registerCalls).toBe(0);
    expect(calls).toEqual([]);
  });

  it("does not let an APNs registration error escape into sign-in", async () => {
    await registerDevice();

    expect(() => cap.listeners.registrationError({ error: "no valid aps-environment" })).not.toThrow();
  });

  it("rebinds after a failed binding instead of registering with nothing listening", async () => {
    cap.native = true;
    cap.addListenerError = new Error("plugin not ready");

    await expect(initPush()).resolves.toBeUndefined();
    expect(cap.listeners.registration).toBeUndefined();

    // The hazard the latch reset exists for: if `listenersBound` survived the failure,
    // this second attempt would skip binding and call register() anyway, and the
    // `registration` event would fire into the void — no token, no error, ever.
    cap.addListenerError = null;
    await registerDevice();

    expect(cap.listeners.registration).toBeTypeOf("function");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/push/register");
  });
});

describe("tapping a notification", () => {
  /** Deliver a tap the way Capacitor does — the APNs custom keys arrive in `data`. */
  const tap = (data: unknown) => cap.listeners.pushNotificationActionPerformed({ notification: { data } });

  it("opens the booking the notification is about", async () => {
    await registerDevice();

    tap({ assessmentId: 7, status: "scheduled" });

    // The payload has always carried assessmentId; until now nothing listened, so a tap
    // just opened the app wherever it was left — including for "Tap to get in touch".
    expect(pushState).toHaveBeenCalledWith(null, "", "/assessments/7");
  });

  it("accepts an id that arrives as a string", async () => {
    await registerDevice();

    tap({ assessmentId: "7" });

    expect(pushState).toHaveBeenCalledWith(null, "", "/assessments/7");
  });

  it("stays put rather than building a broken URL", async () => {
    await registerDevice();

    tap({ assessmentId: "not-a-number" });
    tap({ status: "cancelled" });
    tap(undefined);
    cap.listeners.pushNotificationActionPerformed({});

    // `/assessments/undefined` matches the route and renders its not-found state, which
    // is a worse answer than leaving the user where they already were.
    expect(pushState).not.toHaveBeenCalled();
  });
});

describe("teardownPush", () => {
  it("releases the stored token so the row cannot outlive the session", async () => {
    await registerDevice();
    calls = [];

    await teardownPush();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/push/unregister");
    expect(calls[0].body).toEqual({ token: DEVICE });
  });

  it("is a no-op when this device never registered", async () => {
    await teardownPush();

    expect(calls).toEqual([]);
  });

  it("does not throw when the release fails, so sign-out still proceeds", async () => {
    await registerDevice();
    calls = [];
    respond = () => {
      throw new Error("network down");
    };

    await expect(teardownPush()).resolves.toBeUndefined();
  });

  it("does not throw when the server rejects the release", async () => {
    await registerDevice();
    calls = [];
    respond = () => new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });

    await expect(teardownPush()).resolves.toBeUndefined();
  });

  it("keeps the token when the release fails, so a later sign-out can retry", async () => {
    await registerDevice();
    calls = [];
    respond = () => {
      throw new Error("network down");
    };

    await teardownPush();
    expect(calls).toHaveLength(1);

    // Sign out on a train and the row survives on the server. Forgetting the token here
    // would mean this device — the only thing that knows the row is stale — can never
    // release it, which is the exact hazard teardownPush exists to close.
    calls = [];
    respond = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    await teardownPush();

    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ token: DEVICE });
  });

  it("keeps the token when the server rejects the release", async () => {
    await registerDevice();
    calls = [];
    respond = () => new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });

    await teardownPush();
    calls = [];
    respond = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    await teardownPush();

    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ token: DEVICE });
  });

  it("does not clobber a newly registered token with a stale failed one", async () => {
    await registerDevice();
    calls = [];

    // A release still in flight while the user signs back in: the new token is the one
    // this device is now responsible for, and the retry must not overwrite it.
    let releaseNewToken: (() => void) | undefined;
    respond = () =>
      new Promise<Response>((_, reject) => {
        releaseNewToken = () => reject(new Error("network down"));
      });
    const pending = teardownPush();

    respond = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    await registerDevice("fresh-token");

    releaseNewToken!();
    await pending;

    calls = [];
    await teardownPush();
    expect(calls[0].body).toEqual({ token: "fresh-token" });
  });

  it("forgets the token, so a second sign-out sends nothing", async () => {
    await registerDevice();
    await teardownPush();
    calls = [];

    await teardownPush();

    expect(calls).toEqual([]);
  });
});
