import { api } from "@shared/routes";

/** Anonymous, client-generated visitor id (no PII). Persisted per browser. */
function visitorId(): string {
  try {
    let id = localStorage.getItem("robotat-vid");
    if (!id) {
      id = (crypto.randomUUID?.() ?? String(Math.random()).slice(2)) as string;
      localStorage.setItem("robotat-vid", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

/**
 * Fire-and-forget event to our own backend. Never throws, never blocks navigation.
 *
 * `source` names the control that fired the event, for events reachable from more than
 * one place — only `booking_open` uses it today. It is sent as its own field rather than
 * baked into `type`, because the funnel query matches types exactly and would stop
 * counting a compound value. Omitted from the body entirely when unset, so page views
 * keep sending the payload they always have.
 */
export function track(type: string, path?: string, source?: string): void {
  try {
    void fetch(api.analytics.track.path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({
        type,
        path: path ?? window.location.pathname,
        ...(source ? { source } : {}),
        visitorId: visitorId(),
      }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function trackPageView(path: string): void {
  track("page_view", path);
}
