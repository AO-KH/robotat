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
        cap.listeners[event] = fn;
      },
    };
  },
}));

const { initPush, teardownPush, resetPushForTests } = await import("@/lib/push");

const DEVICE = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

let calls: Array<{ url: string; body: unknown }>;
let respond: () => Response | Promise<Response>;

beforeEach(() => {
  resetPushForTests();
  cap.native = false;
  cap.pluginsRequested = [];
  cap.permission = "granted";
  cap.listeners = {};
  cap.registerCalls = 0;

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

  it("forgets the token, so a second sign-out sends nothing", async () => {
    await registerDevice();
    await teardownPush();
    calls = [];

    await teardownPush();

    expect(calls).toEqual([]);
  });
});
