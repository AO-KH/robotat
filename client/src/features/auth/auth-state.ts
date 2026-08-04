import type { QueryClient } from "@tanstack/react-query";
import { setAuthToken } from "@/lib/auth-token";

/** Cache key for the current user. Shared so hooks and cache-clearing agree on it. */
export const ME_KEY = ["/api/auth/me"] as const;

/**
 * Drop every trace of the signed-in user: their bearer token and the whole query cache.
 *
 * This deliberately does NOT use `invalidateQueries`, which only marks entries stale
 * and leaves the data sitting in the cache. That was the previous behaviour, and it
 * only ever covered the assessments key — so `/api/admin/assessments` (every
 * customer's bookings), `/api/admin/analytics`, and `/api/contact` (whose links the
 * server prefills with the signed-in user's name, email and phone) all survived a
 * sign-out. Combined with the global `staleTime: Infinity` in lib/queryClient.ts, the
 * next person to sign in on a shared or kiosk device could be handed the previous
 * user's data straight from cache, with `isLoading` already false so no spinner ever
 * hid it.
 *
 * Lives outside the hooks module, and takes the client as an argument, so it can be
 * tested without mounting React.
 */
export function clearSignedInState(qc: QueryClient): void {
  setAuthToken(null);
  qc.clear();
  // Re-seed the signed-out answer so route guards read `null` (signed out) rather than
  // `undefined` (still loading) and send the user straight to /auth without flicker.
  qc.setQueryData(ME_KEY, null);
}
