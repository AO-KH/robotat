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
    const path = typeof input === "string" ? input : input instanceof URL ? input.toString() : null;
    if (path === null || !path.startsWith("/api")) {
      return fetchImpl(input, init);
    }

    const headers = new Headers(init?.headers);
    const token = getToken();
    // Never overwrite a header the caller set explicitly.
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    // `headers` last so the merged value wins over any copy inside init.
    return fetchImpl(base + path, { credentials: "include", ...init, headers });
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
