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
