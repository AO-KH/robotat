import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ME_KEY, clearSignedInState } from "@/features/auth/auth-state";
import { getAuthToken, setAuthToken, resetAuthTokenForTests } from "@/lib/auth-token";

/**
 * Signing out has to leave nothing behind. On a shared or kiosk browser the next
 * person to sign in must not be handed the previous user's data — and because
 * lib/queryClient.ts sets a global `staleTime: Infinity`, anything left in the cache
 * is served with `isLoading` already false, so no spinner would ever hide it.
 *
 * The keys below are the real ones the app writes: see use-assessments.ts,
 * use-admin.ts and use-products.ts.
 */

/** Seed the cache exactly as a signed-in staff user's session would leave it. */
function seedSignedInCache(qc: QueryClient): void {
  qc.setQueryData(ME_KEY, { id: 1, name: "Mona", email: "mona@sunfarms.sa", role: "staff" });
  qc.setQueryData(["/api/assessments"], [{ id: 7, email: "mona@sunfarms.sa", location: "Al Kharj" }]);
  qc.setQueryData(["/api/assessments", 7], { id: 7, message: "Date palm orchard" });
  // Admin keys — these were never invalidated by the old implementation.
  qc.setQueryData(["/api/admin/assessments", "all"], [{ id: 7, name: "Mona", phone: "+966500000000" }]);
  qc.setQueryData(["/api/admin/analytics"], { totalPageViews: 42, uniqueVisitors: 9 });
  // Built server-side from req.user — contains the signed-in user's contact details.
  qc.setQueryData(["/api/contact"], { whatsappUrl: "https://wa.me/…mona@sunfarms.sa", mailtoUrl: "mailto:…" });
}

let qc: QueryClient;

beforeEach(() => {
  resetAuthTokenForTests();
  qc = new QueryClient();
});

describe("clearSignedInState", () => {
  it("leaves no cached entry from the previous session except the signed-out marker", () => {
    seedSignedInCache(qc);
    expect(qc.getQueryCache().getAll().length).toBeGreaterThan(1);

    clearSignedInState(qc);

    const remaining = qc.getQueryCache().getAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].queryKey).toEqual([...ME_KEY]);
    expect(remaining[0].state.data).toBeNull();
  });

  it("drops the admin caches, which invalidation alone never touched", () => {
    seedSignedInCache(qc);
    clearSignedInState(qc);

    expect(qc.getQueryData(["/api/admin/assessments", "all"])).toBeUndefined();
    expect(qc.getQueryData(["/api/admin/analytics"])).toBeUndefined();
  });

  it("drops the contact links, which are prefilled with the user's own details", () => {
    seedSignedInCache(qc);
    clearSignedInState(qc);

    expect(qc.getQueryData(["/api/contact"])).toBeUndefined();
  });

  it("drops the previous user's assessments, list and detail alike", () => {
    seedSignedInCache(qc);
    clearSignedInState(qc);

    expect(qc.getQueryData(["/api/assessments"])).toBeUndefined();
    expect(qc.getQueryData(["/api/assessments", 7])).toBeUndefined();
  });

  it("reports signed-out rather than loading, so guards redirect without flicker", () => {
    seedSignedInCache(qc);
    clearSignedInState(qc);

    // `null` means "asked, and nobody is signed in". `undefined` would mean "still
    // loading" and would hold a protected route on its spinner instead of redirecting.
    expect(qc.getQueryData(ME_KEY)).toBeNull();
  });

  it("clears the bearer token so the native app cannot keep calling authenticated", () => {
    setAuthToken("a.token");
    expect(getAuthToken()).toBe("a.token");

    clearSignedInState(qc);

    expect(getAuthToken()).toBeNull();
  });
});
