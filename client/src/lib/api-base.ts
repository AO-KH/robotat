/**
 * API base URL for the native app shell.
 *
 * On the web the client is served from the same origin as the API, so every
 * `fetch("/api/…")` resolves correctly with a relative path. Inside the Capacitor
 * iOS shell the client is served from the `capacitor://localhost` origin, where a
 * relative `/api/…` would hit the app bundle, not the backend. When the app is
 * built with `VITE_API_URL` set to the deployed HTTPS origin, this shim rewrites
 * relative `/api` calls to absolute ones.
 *
 * It is a no-op on the web (VITE_API_URL unset) so nothing changes there.
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

/** Absolute URL for an API path, honoring VITE_API_URL when present. */
export function apiUrl(path: string): string {
  return API_BASE && path.startsWith("/api") ? API_BASE + path : path;
}

/**
 * Install a global fetch shim that prefixes relative `/api` requests with the
 * configured base. Call once at startup, before any data fetching. No-op on web.
 */
export function installApiBase(): void {
  if (!API_BASE) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === "string" && input.startsWith("/api")) {
      // Native cross-origin auth rides on the bearer token, not cookies, but keep
      // credentials for any same-origin case; harmless when unused.
      return originalFetch(API_BASE + input, { credentials: "include", ...init });
    }
    return originalFetch(input as Parameters<typeof originalFetch>[0], init);
  };
}
