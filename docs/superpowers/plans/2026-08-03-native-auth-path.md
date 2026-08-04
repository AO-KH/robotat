# Native Authentication Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Capacitor iOS app authenticate against the deployed API, which it currently cannot do at all.

**Architecture:** The website is same-origin and authenticates with an HTTP-only session cookie; none of that works from the app. The Capacitor webview loads the bundled client from `capacitor://localhost`, so every API call is cross-origin — the browser blocks it because the server sends no CORS headers, and cookies are unreliable from a custom-scheme origin. This plan adds an allowlist CORS middleware server-side, and client-side swaps the app onto the already-built `POST /api/auth/token` bearer endpoint, attaching `Authorization` via the existing fetch shim. The website's behaviour is unchanged throughout.

**Tech Stack:** Express 5, TypeScript, Zod, React 18 + TanStack Query, Vitest + Supertest (node environment), Capacitor 7.

---

## Scope

This is **plan 1 of the iOS critical path**. Deliberately excluded, each its own later plan:

- **Keychain persistence** — the token is in-memory here, so a relaunch requires signing in again. The adapter interface lands in Task 4 so the native implementation drops in without touching call sites; it needs a plugin and a device to verify.
- **Account deletion** (App Store Guideline 5.1.1(v)) — independent, and needs a product decision about what happens to a deleted user's assessments.
- **APNs push** (Guideline 4.2), **Universal Links**, **offline/error states**.

**Explicitly not doing:** changing the production CSP. The reviewer's claim that `connect-src 'self'` blocks the app is wrong — verified 2026-08-03: `client/index.html` has no CSP meta tag and Capacitor serves the page from the app bundle, so the server's CSP header never applies to the webview. `'self'` is correct for the website.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `server/lib/cors.ts` (create) | Origin allowlist + CORS middleware. Pure helpers separated from the handler so they're testable without HTTP. |
| `server/lib/env.ts` (modify) | Add optional `CORS_ORIGINS`. |
| `server/app.ts` (modify) | Mount CORS immediately after helmet, before body parsing and routes, so preflights short-circuit ahead of auth and rate limiters. |
| `client/src/lib/auth-token.ts` (create) | In-memory bearer token + a persistence adapter seam. No DOM, so it unit-tests in the node environment. |
| `client/src/lib/api-base.ts` (modify) | Factor the shim into a pure `createApiFetch` (testable) plus a thin `installApiBase` that wires `window.fetch`. Attaches `Authorization`. |
| `client/src/features/auth/use-auth.ts` (modify) | On native, log in via `/api/auth/token` and store the token; clear it on logout. |
| `test/cors.test.ts` (create) | Allowlist unit tests — no app, no database. |
| `test/cors-http.test.ts` (create) | Preflight, allowed/disallowed origins, `Vary`, credentials, no-Origin passthrough, over real HTTP. |
| `test/auth-token.test.ts` (create) | Store get/set/clear and persistence adapter. |
| `test/api-fetch.test.ts` (create) | Prefixing, header attachment, non-`/api` passthrough. |

**Test environment note:** `vitest.config.ts` sets `environment: "node"` and `include: ["test/**/*.test.ts"]`. Client modules are importable there via the `@` alias, but **only if they touch no DOM** — that is why `auth-token.ts` and `createApiFetch` take their dependencies as parameters instead of reaching for `window`.

---

## Task 1: Config for extra allowed origins

**Files:**
- Modify: `server/lib/env.ts`

- [ ] **Step 1: Add `CORS_ORIGINS` to the schema**

In `server/lib/env.ts`, inside the `schema = z.object({ … })` block, add after the `PUBLIC_APP_URL` entry:

```ts
  // Comma-separated extra origins allowed to call the API cross-origin, e.g. a
  // separately-hosted web client. The Capacitor origins are always allowed and do
  // not need listing here.
  CORS_ORIGINS: z.string().optional(),
```

- [ ] **Step 2: Verify the typecheck still passes**

Run: `npm run check`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add server/lib/env.ts
git commit -m "feat(cors): add CORS_ORIGINS to validated env"
```

---

## Task 2: CORS allowlist helpers

**Files:**
- Create: `server/lib/cors.ts`
- Test: `test/cors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/cors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { allowedOrigins, isAllowedOrigin } from "../server/lib/cors";

describe("cors allowlist", () => {
  it("always allows the Capacitor origins, with no configuration", () => {
    const allowed = allowedOrigins(undefined);
    expect(isAllowedOrigin("capacitor://localhost", allowed)).toBe(true);
    expect(isAllowedOrigin("ionic://localhost", allowed)).toBe(true);
  });

  it("adds configured origins and ignores whitespace and empties", () => {
    const allowed = allowedOrigins(" https://a.example , ,https://b.example ");
    expect(isAllowedOrigin("https://a.example", allowed)).toBe(true);
    expect(isAllowedOrigin("https://b.example", allowed)).toBe(true);
    expect(allowed).not.toContain("");
  });

  it("rejects anything not listed, and is not a prefix match", () => {
    const allowed = allowedOrigins("https://robotat.example");
    expect(isAllowedOrigin("https://evil.example", allowed)).toBe(false);
    expect(isAllowedOrigin("https://robotat.example.evil.com", allowed)).toBe(false);
    expect(isAllowedOrigin(undefined, allowed)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run test/cors.test.ts`
Expected: FAIL — `Failed to resolve import "../server/lib/cors"`.

- [ ] **Step 3: Write the implementation**

Create `server/lib/cors.ts`:

```ts
import type { RequestHandler } from "express";

/**
 * The website is served from the same origin as the API and needs no CORS at all.
 * This exists for the Capacitor iOS shell, which loads the bundled client from
 * capacitor://localhost — so every call to the deployed API is cross-origin and the
 * webview blocks it unless the server opts in.
 */
const NATIVE_ORIGINS = ["capacitor://localhost", "ionic://localhost"];

const ALLOWED_METHODS = "GET,POST,PATCH,DELETE,OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization";
const MAX_AGE_SECONDS = "600";

/** Native origins plus any comma-separated extras from CORS_ORIGINS. */
export function allowedOrigins(configured?: string): string[] {
  const extra = (configured ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...NATIVE_ORIGINS, ...extra];
}

/** Exact match only — never a prefix test, which https://robotat.example.evil.com would pass. */
export function isAllowedOrigin(origin: string | undefined, allowed: string[]): boolean {
  return typeof origin === "string" && allowed.includes(origin);
}

export function createCors(allowed: string[]): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;

    // No Origin header: same-origin browser request, curl, or a health probe.
    // Adding CORS headers here would be noise, so leave the response untouched.
    if (!origin) return next();

    // The response now depends on the request's Origin; without this a shared cache
    // could serve one origin's response to another. res.vary appends rather than
    // clobbering any Vary helmet or Express already set.
    res.vary("Origin");

    // Unlisted origin: send no CORS headers and carry on. The browser blocks the
    // read itself, and returning 403 here would leak which origins are allowed.
    if (!isAllowedOrigin(origin, allowed)) return next();

    // Echo the specific origin rather than "*", which is required once credentials
    // are allowed and keeps the allowlist meaningful.
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
      res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
      res.setHeader("Access-Control-Max-Age", MAX_AGE_SECONDS);
      return res.sendStatus(204);
    }

    next();
  };
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run test/cors.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/lib/cors.ts test/cors.test.ts
git commit -m "feat(cors): origin allowlist helpers"
```

---

## Task 3: Mount CORS and prove it over HTTP

**Files:**
- Modify: `server/app.ts`
- Test: `test/cors-http.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Create `test/cors-http.test.ts` (a separate file from the unit tests — it needs the
whole app and a database, while `cors.test.ts` needs neither):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { getApp } from "./helpers";

let app: Express;
beforeAll(async () => {
  app = await getApp();
});

describe("cors over HTTP", () => {
  const NATIVE = "capacitor://localhost";

  it("answers a preflight from the app with 204 and the right headers", async () => {
    const res = await request(app)
      .options("/api/auth/me")
      .set("Origin", NATIVE)
      .set("Access-Control-Request-Method", "GET");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(NATIVE);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-allow-headers"]).toContain("Authorization");
    expect(res.headers["vary"]).toContain("Origin");
  });

  it("echoes the origin on a real request", async () => {
    const res = await request(app).get("/api/health").set("Origin", NATIVE);
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(NATIVE);
  });

  it("sends no CORS headers to an unlisted origin", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://evil.example");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    // Still varies on Origin so a cache cannot serve this to an allowed origin.
    expect(res.headers["vary"]).toContain("Origin");
  });

  it("leaves same-origin requests completely untouched", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/cors-http.test.ts`
Expected: FAIL — the preflight returns 404 and `access-control-allow-origin` is undefined.

- [ ] **Step 3: Mount the middleware**

In `server/app.ts`, add to the imports at the top:

```ts
import { allowedOrigins, createCors } from "./lib/cors";
```

Then insert immediately after the closing `);` of the `app.use(helmet({ … }))` call and **before** `app.use(express.json({ … }))`:

```ts
  // Cross-origin access for the Capacitor iOS shell. Mounted before body parsing,
  // sessions and the rate limiters so a preflight is answered without touching them —
  // an OPTIONS request carries no credentials to authenticate anyway.
  app.use(createCors(allowedOrigins(env.CORS_ORIGINS)));
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run test/cors-http.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the whole suite to check nothing regressed**

Run: `npm test`
Expected: all files pass. The count should be the previous total plus 7 (3 unit + 4 HTTP).

- [ ] **Step 6: Commit**

```bash
git add server/app.ts test/cors-http.test.ts
git commit -m "feat(cors): allow the Capacitor origin to reach the API"
```

---

## Task 4: Bearer token store

**Files:**
- Create: `client/src/lib/auth-token.ts`
- Test: `test/auth-token.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/auth-token.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run test/auth-token.test.ts`
Expected: FAIL — cannot resolve `@/lib/auth-token`.

- [ ] **Step 3: Write the implementation**

Create `client/src/lib/auth-token.ts`:

```ts
/**
 * Bearer token store for the native app.
 *
 * The website authenticates with an HTTP-only session cookie and never touches this.
 * The Capacitor webview cannot rely on cookies from the capacitor://localhost origin,
 * so it authenticates with `Authorization: Bearer …` from POST /api/auth/token.
 *
 * The token lives in memory. Persisting it across app launches sits behind an adapter
 * on purpose: on iOS it belongs in the Keychain, which needs a native plugin and a
 * device to verify. localStorage would be the wrong answer — any script running in
 * the webview can read it.
 */
export interface TokenPersistence {
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
}

let token: string | null = null;
let persistence: TokenPersistence | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export function getAuthToken(): string | null {
  return token;
}

/**
 * Set (or clear, with null) the token.
 *
 * Persistence writes are queued rather than fired in parallel: they must land in the
 * order they were requested, or a slow save could overwrite a later clear and leave a
 * token in the Keychain after an explicit sign-out. Failures are swallowed — a failed
 * write must not break sign-in, since the in-memory token still works.
 */
export function setAuthToken(next: string | null): void {
  token = next;
  if (!persistence) return;

  const impl = persistence;
  writeQueue = writeQueue
    .then(() => (next === null ? impl.clear() : impl.save(next)))
    .catch((err) => {
      // Otherwise a Keychain failure is invisible until the user is mysteriously
      // signed out on next launch.
      console.warn("[auth] could not persist the auth token", err);
    });
}

export function registerTokenPersistence(impl: TokenPersistence): void {
  persistence = impl;
}

/** Load a previously persisted token at startup. Returns null when there is none. */
export async function restoreAuthToken(): Promise<string | null> {
  if (!persistence) return null;
  try {
    token = await persistence.load();
  } catch {
    token = null;
  }
  return token;
}

/** Test seam: drop the token and any registered persistence. */
export function resetAuthTokenForTests(): void {
  token = null;
  persistence = null;
  writeQueue = Promise.resolve();
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run test/auth-token.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/auth-token.ts test/auth-token.test.ts
git commit -m "feat(auth): in-memory bearer token store with a persistence seam"
```

---

## Task 5: Attach the token in the fetch shim

**Files:**
- Modify: `client/src/lib/api-base.ts`
- Test: `test/api-fetch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/api-fetch.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run test/api-fetch.test.ts`
Expected: FAIL — `createApiFetch` is not exported.

- [ ] **Step 3: Rewrite `client/src/lib/api-base.ts`**

Replace the entire file with:

```ts
import { getAuthToken } from "./auth-token";

/**
 * API base URL and auth header for the native app shell.
 *
 * On the web the client is served from the same origin as the API, so `fetch("/api/…")`
 * resolves correctly and the session cookie rides along. Inside the Capacitor iOS shell
 * the client is served from capacitor://localhost, where a relative "/api/…" would hit
 * the app bundle rather than the backend, and cookies are unreliable. When the app is
 * built with VITE_API_URL set, this shim rewrites those calls to absolute URLs and
 * attaches the bearer token.
 *
 * Entirely a no-op on the web (VITE_API_URL unset).
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

/** True when running against a cross-origin API — i.e. the native build. */
export function isNativeApiMode(): boolean {
  return API_BASE !== "";
}

/** Absolute URL for an API path, honouring VITE_API_URL when present. */
export function apiUrl(path: string): string {
  return API_BASE && path.startsWith("/api") ? API_BASE + path : path;
}

/**
 * Build a fetch wrapper. Dependencies are parameters rather than module globals so
 * this is unit-testable in the node test environment, where there is no window.
 */
export function createApiFetch(opts: {
  base: string;
  getToken: () => string | null;
  fetchImpl: typeof fetch;
}): typeof fetch {
  const { base, getToken, fetchImpl } = opts;

  return ((input: RequestInfo | URL, init?: RequestInit) => {
    // Only string paths are rewritten. `URL` and `Request` inputs pass through
    // untouched and unauthenticated — deliberately. Deriving a pathname from them
    // would let `fetch(new URL("https://elsewhere.example/api/x"))` be silently
    // redirected to our API base with the user's bearer token attached, which is a
    // worse failure than not supporting the shape. Every call site in this codebase
    // passes a literal "/api/…" string from shared/routes.ts.
    if (typeof input !== "string" || !input.startsWith("/api")) {
      return fetchImpl(input, init);
    }

    const headers = new Headers(init?.headers);
    const token = getToken();
    // Never overwrite a header the caller set explicitly.
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    // `headers` last so the merged value wins over any copy inside init.
    return fetchImpl(base + input, { credentials: "include", ...init, headers });
  }) as typeof fetch;
}

/**
 * Install the shim over window.fetch. Call once at startup, before any data fetching.
 * No-op on the web. Idempotent, because Vite HMR re-runs the module that calls it and
 * wrapping an already-wrapped fetch on every reload would grow the chain unbounded.
 */
export function installApiBase(): void {
  if (!API_BASE) return;

  const current = window.fetch as typeof fetch & { __apiBase?: true };
  if (current.__apiBase) return;

  const patched = createApiFetch({
    base: API_BASE,
    getToken: getAuthToken,
    fetchImpl: current.bind(window),
  }) as typeof fetch & { __apiBase?: true };
  patched.__apiBase = true;
  window.fetch = patched;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run test/api-fetch.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/api-base.ts test/api-fetch.test.ts
git commit -m "feat(auth): attach the bearer token in the native fetch shim"
```

---

## Task 6: Sign in with a token on native

**Files:**
- Modify: `client/src/features/auth/use-auth.ts`

- [ ] **Step 1: Add the imports**

At the top of `client/src/features/auth/use-auth.ts`, after the existing import of `useToast`, add:

```ts
import { isNativeApiMode } from "@/lib/api-base";
import { setAuthToken } from "@/lib/auth-token";
```

- [ ] **Step 2: Add a helper above `useCurrentUser`**

Insert directly after the `readError` function:

```ts
/**
 * Exchange credentials for a bearer token and store it. Used only in the native
 * build, where the session cookie the website relies on is not dependable from the
 * capacitor:// origin. Returns the user so callers can treat it like a normal login.
 */
async function loginWithToken(data: LoginInput): Promise<PublicUser> {
  const res = await fetch(api.auth.token.path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(api.auth.token.input.parse(data)),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not sign in"));
  const body = (await res.json()) as { token: string; user: PublicUser };
  setAuthToken(body.token);
  return body.user;
}
```

- [ ] **Step 3: Route `useLogin` through it on native**

In `useLogin`, replace the body of `mutationFn` with:

```ts
    mutationFn: async (data: LoginInput) => {
      if (isNativeApiMode()) return loginWithToken(data);

      const res = await fetch(api.auth.login.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.auth.login.input.parse(data)),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not sign in"));
      return (await res.json()) as PublicUser;
    },
```

- [ ] **Step 4: Have `useRegister` obtain a token too**

In `useRegister`, replace the body of `mutationFn` with:

```ts
    mutationFn: async (data: RegisterInput) => {
      const res = await fetch(api.auth.register.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.auth.register.input.parse(data)),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not create account"));
      const user = (await res.json()) as PublicUser;

      // Registration signs the user in via cookie, which the native shell cannot use;
      // exchange the same credentials for a token so the app is actually authenticated.
      if (isNativeApiMode()) {
        await loginWithToken({ email: data.email, password: data.password });
      }
      return user;
    },
```

- [ ] **Step 5: Clear the token on logout**

In `useLogout`, replace the `onSuccess` callback with:

```ts
    onSuccess: () => {
      setAuthToken(null);
      qc.setQueryData(ME_KEY, null);
      qc.invalidateQueries({ queryKey: ["/api/assessments"] });
    },
```

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npm run check && npm test`
Expected: typecheck silent; every test file passes.

- [ ] **Step 7: Commit**

```bash
git add client/src/features/auth/use-auth.ts
git commit -m "feat(auth): sign in with a bearer token in the native build"
```

---

## Task 7: Verify end to end and document

**Files:**
- Modify: `.env.example`
- Modify: `docs/IOS.md`

- [ ] **Step 1: Prove a cross-origin request works against the running server**

Start the dev server if it is not running, then run:

```bash
curl -si -X OPTIONS http://localhost:5000/api/auth/me \
  -H 'Origin: capacitor://localhost' -H 'Access-Control-Request-Method: GET' | head -12
```

Expected: `HTTP/1.1 204`, plus `access-control-allow-origin: capacitor://localhost`, `access-control-allow-credentials: true`, and `vary:` containing `Origin`.

Then confirm an unlisted origin gets nothing:

```bash
curl -si http://localhost:5000/api/health -H 'Origin: https://evil.example' | grep -i "access-control" || echo "no CORS headers (correct)"
```

Expected: `no CORS headers (correct)`.

- [ ] **Step 2: Prove the website is unaffected**

Open `http://localhost:5000/` in the Browser pane, sign in with an existing account, and confirm the dashboard loads. Check the console for errors.
Expected: sign-in works exactly as before; no console errors. The shim is inert because `VITE_API_URL` is unset.

- [ ] **Step 3: Document the new variable**

In `.env.example`, add below the `PUBLIC_APP_URL` block:

```dotenv
# Comma-separated extra origins allowed to call the API cross-origin. The Capacitor
# origins (capacitor://localhost, ionic://localhost) are always allowed and need not
# be listed. Only needed if you host the web client on a different origin to the API.
# CORS_ORIGINS=https://app.robotat.example
```

- [ ] **Step 4: Update the iOS guide**

In `docs/IOS.md`, replace the bullet beginning "Bearer-token auth (`POST /api/auth/token` …" under "What's already wired" with:

```markdown
- Bearer-token auth, wired end to end: the native build signs in via
  `POST /api/auth/token` (`client/src/features/auth/use-auth.ts`), stores the token in
  `client/src/lib/auth-token.ts`, and `client/src/lib/api-base.ts` attaches it as
  `Authorization: Bearer …` on every `/api` call. The server allows the
  `capacitor://localhost` origin via `server/lib/cors.ts`.
- **Not yet done:** the token is held in memory only, so relaunching the app requires
  signing in again. Register a `TokenPersistence` backed by the iOS Keychain (see the
  interface in `auth-token.ts`) — not `@capacitor/preferences`, which is not secure.
```

- [ ] **Step 5: Final verification**

Run: `npm run check && npm test && npm run build`
Expected: typecheck silent, all tests pass, `dist/index.cjs` and `dist/migrate.cjs` written.

- [ ] **Step 6: Commit**

```bash
git add .env.example docs/IOS.md
git commit -m "docs: document CORS_ORIGINS and the native auth path"
```

---

## Done When

- A preflight from `capacitor://localhost` returns 204 with the correct headers; an unlisted origin receives none.
- The native build authenticates with a bearer token and every `/api` call carries `Authorization`.
- The website's cookie login is unchanged and still passes its existing tests.
- `npm run check`, `npm test` and `npm run build` are all green.

**Explicitly still broken after this plan** (each its own follow-up): the token does not survive an app relaunch; there is no in-app account deletion, which will fail App Store review under Guideline 5.1.1(v); there is no push, which is the Guideline 4.2 mitigation; emailed links open Safari rather than the app.
