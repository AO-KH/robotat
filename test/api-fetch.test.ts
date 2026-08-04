import { describe, it, expect } from "vitest";
import { createApiFetch } from "@/lib/api-base";

const BASE = "https://api.example";

/** Records what the shim passed through, and returns an empty 200. */
function spyFetch() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe("createApiFetch", () => {
  it("prefixes relative /api paths with the configured base", async () => {
    const { calls, impl } = spyFetch();
    const f = createApiFetch({ base: BASE, getToken: () => null, fetchImpl: impl });
    await f("/api/auth/me");
    expect(calls[0].url).toBe(`${BASE}/api/auth/me`);
  });

  it("attaches the bearer token when one is present", async () => {
    const { calls, impl } = spyFetch();
    const f = createApiFetch({ base: BASE, getToken: () => "tok123", fetchImpl: impl });
    await f("/api/auth/me");
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("Bearer tok123");
  });

  it("sends no Authorization header when signed out", async () => {
    const { calls, impl } = spyFetch();
    const f = createApiFetch({ base: BASE, getToken: () => null, fetchImpl: impl });
    await f("/api/auth/me");
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBeNull();
  });

  it("does not clobber an Authorization header the caller already set", async () => {
    const { calls, impl } = spyFetch();
    const f = createApiFetch({ base: BASE, getToken: () => "tok123", fetchImpl: impl });
    await f("/api/auth/me", { headers: { Authorization: "Bearer explicit" } });
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("Bearer explicit");
  });

  it("preserves the method and body", async () => {
    const { calls, impl } = spyFetch();
    const f = createApiFetch({ base: BASE, getToken: () => null, fetchImpl: impl });
    await f("/api/auth/login", { method: "POST", body: '{"a":1}' });
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBe('{"a":1}');
  });

  it("leaves non-/api requests alone", async () => {
    const { calls, impl } = spyFetch();
    const f = createApiFetch({ base: BASE, getToken: () => "tok123", fetchImpl: impl });
    await f("/assets/logo.svg");
    expect(calls[0].url).toBe("/assets/logo.svg");
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBeNull();
  });
});
