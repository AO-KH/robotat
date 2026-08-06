import { describe, it, expect, beforeEach } from "vitest";
import {
  getAuthToken,
  setAuthToken,
  registerTokenPersistence,
  restoreAuthToken,
  resetAuthTokenForTests,
} from "@/lib/auth-token";
import {
  secureTokenPersistence,
  memoryTokenPersistence,
  type SecureStore,
} from "@/lib/token-persistence";

beforeEach(() => resetAuthTokenForTests());

/** Stands in for a Capacitor secure-storage plugin, which cannot run off a device. */
function fakeStore(initial: string | null = null) {
  let value = initial;
  const calls: string[] = [];
  const store: SecureStore = {
    async get() {
      calls.push("get");
      return { value };
    },
    async set({ value: v }) {
      calls.push("set");
      value = v;
    },
    async remove() {
      calls.push("remove");
      value = null;
    },
  };
  return { store, calls, current: () => value };
}

describe("secureTokenPersistence", () => {
  it("round-trips a token through the store", async () => {
    const { store, current } = fakeStore();
    const p = secureTokenPersistence(store);

    await p.save("a.token");
    expect(current()).toBe("a.token");
    expect(await p.load()).toBe("a.token");

    await p.clear();
    expect(current()).toBeNull();
    expect(await p.load()).toBeNull();
  });

  it("treats a read failure as no token rather than throwing", async () => {
    // A Keychain miss on first launch and a Keychain error are the same thing to the
    // caller — no usable token. The app must start signed-out, not fail to start.
    const p = secureTokenPersistence({
      async get() {
        throw new Error("keychain unavailable");
      },
      async set() {},
      async remove() {},
    });
    await expect(p.load()).resolves.toBeNull();
  });
});

describe("restoring at boot", () => {
  it("makes a stored token available before anything reads it", async () => {
    // The whole point: the fetch shim reads getAuthToken() at request time, so the
    // token has to be in memory before the first request is built.
    const { store } = fakeStore("stored.token");
    registerTokenPersistence(secureTokenPersistence(store));

    expect(getAuthToken()).toBeNull(); // nothing yet
    await restoreAuthToken();
    expect(getAuthToken()).toBe("stored.token");
  });

  it("returns null and stays signed out when the store is empty", async () => {
    const { store } = fakeStore(null);
    registerTokenPersistence(secureTokenPersistence(store));

    await expect(restoreAuthToken()).resolves.toBeNull();
    expect(getAuthToken()).toBeNull();
  });

  it("is a no-op when nothing is registered — the web path", async () => {
    // No persistence is registered on the website; the session cookie covers it.
    await expect(restoreAuthToken()).resolves.toBeNull();
    expect(getAuthToken()).toBeNull();
  });
});

describe("clearing a revoked token", () => {
  it("removes it from the store, not just from memory", async () => {
    // The server bumps token_version on a password change, so a stored token can be
    // dead. If clearing only dropped the in-memory copy, the dead one would be
    // restored and retried on every launch, failing silently each time.
    const { store, current } = fakeStore("revoked.token");
    registerTokenPersistence(secureTokenPersistence(store));
    await restoreAuthToken();
    expect(getAuthToken()).toBe("revoked.token");

    setAuthToken(null); // what useCurrentUser does on a 401 while holding a token
    await new Promise((r) => setTimeout(r, 0)); // the write queue is async

    expect(getAuthToken()).toBeNull();
    expect(current()).toBeNull();
  });

  it("persists a fresh token over a stale one", async () => {
    const { store, current } = fakeStore("old.token");
    registerTokenPersistence(secureTokenPersistence(store));
    await restoreAuthToken();

    setAuthToken("new.token");
    await new Promise((r) => setTimeout(r, 0));

    expect(current()).toBe("new.token");
  });

  it("orders a slow save behind a later clear", async () => {
    // Regression guard. Writes are queued rather than fired in parallel: a save that
    // resolves after a clear would otherwise leave a token in the Keychain after an
    // explicit sign-out — signed out on screen, still authenticated on disk.
    let releaseSave: () => void = () => {};
    const slow = new Promise<void>((r) => (releaseSave = r));
    let stored: string | null = null;

    registerTokenPersistence({
      async load() {
        return null;
      },
      async save(t) {
        await slow;
        stored = t;
      },
      async clear() {
        stored = null;
      },
    });

    setAuthToken("late.token"); // starts, then blocks
    setAuthToken(null); // queued behind it
    releaseSave();
    await new Promise((r) => setTimeout(r, 0));

    expect(stored).toBeNull();
    expect(getAuthToken()).toBeNull();
  });
});

describe("memoryTokenPersistence", () => {
  it("behaves like the real thing without a device", async () => {
    const p = memoryTokenPersistence();
    expect(await p.load()).toBeNull();
    await p.save("x");
    expect(await p.load()).toBe("x");
    await p.clear();
    expect(await p.load()).toBeNull();
  });
});
