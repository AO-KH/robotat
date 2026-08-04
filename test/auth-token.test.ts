import { describe, it, expect, beforeEach } from "vitest";
import {
  getAuthToken,
  setAuthToken,
  registerTokenPersistence,
  restoreAuthToken,
  resetAuthTokenForTests,
} from "@/lib/auth-token";

beforeEach(() => {
  resetAuthTokenForTests();
});

describe("auth token store", () => {
  it("starts empty and round-trips a token", () => {
    expect(getAuthToken()).toBeNull();
    setAuthToken("abc.def");
    expect(getAuthToken()).toBe("abc.def");
    setAuthToken(null);
    expect(getAuthToken()).toBeNull();
  });

  it("writes through to persistence when one is registered", async () => {
    const calls: string[] = [];
    registerTokenPersistence({
      load: async () => null,
      save: async (t) => void calls.push(`save:${t}`),
      clear: async () => void calls.push("clear"),
    });

    setAuthToken("tok");
    setAuthToken(null);
    await new Promise((r) => setTimeout(r, 0)); // writes are fire-and-forget

    expect(calls).toEqual(["save:tok", "clear"]);
  });

  it("restores a persisted token", async () => {
    registerTokenPersistence({
      load: async () => "restored",
      save: async () => {},
      clear: async () => {},
    });
    expect(await restoreAuthToken()).toBe("restored");
    expect(getAuthToken()).toBe("restored");
  });

  it("treats a failing persistence load as signed out rather than throwing", async () => {
    registerTokenPersistence({
      load: async () => {
        throw new Error("keychain unavailable");
      },
      save: async () => {},
      clear: async () => {},
    });
    expect(await restoreAuthToken()).toBeNull();
  });
});
