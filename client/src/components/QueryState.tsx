import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";

/**
 * A fetched list has four possible answers, not two: still loading, it failed, it
 * came back empty, or here is the content. Rendering only the last two is why a
 * failed /api/products left the products page showing its heading above nothing —
 * indistinguishable from a catalogue with no products in it. With `retry: false`
 * and `staleTime: Infinity` in lib/queryClient.ts, that state was also permanent.
 *
 * `onRetry` should be the query's own `refetch`, which bypasses staleTime.
 */
export function QueryState({
  isLoading,
  isLoadingError,
  isEmpty,
  onRetry,
  loadingLabel,
  errorTitle,
  errorBody,
  retryLabel,
  emptyTitle,
  emptyBody,
  emptyAction,
  children,
}: {
  isLoading: boolean;
  /**
   * Pass the query's `isLoadingError`, NOT its `isError`. Once a query holds data, a
   * failed *refetch* still flips `isError` true while leaving that data intact — and
   * both the admin list and the dashboard list are invalidated on every status change
   * and every booking, so this is reachable on any flaky connection. Reacting to
   * `isError` would swap a perfectly good list for an error card. `isLoadingError` is
   * error AND nothing cached, which is the only moment there is truly nothing to show;
   * a refetch that fails over existing data leaves the stale list on screen instead.
   */
  isLoadingError: boolean;
  isEmpty: boolean;
  onRetry?: () => void;
  loadingLabel: string;
  errorTitle: string;
  errorBody: string;
  retryLabel: string;
  emptyTitle: string;
  emptyBody: string;
  /** Optional call to action for the empty state — e.g. the dashboard's "book" button. */
  emptyAction?: ReactNode;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="py-16 flex justify-center" role="status" aria-live="polite">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        {/* The spinner is decorative; this is what a screen reader actually announces. */}
        <span className="sr-only">{loadingLabel}</span>
      </div>
    );
  }

  if (isLoadingError) {
    return (
      <div className="surface rounded-2xl py-12 px-6 text-center" role="alert">
        {/*
          `.text-heading` is the page-title role — at 52px on desktop it rendered this
          notice larger than the "Our products" h1 above it, an error out-shouting the
          page. A card title inside a panel is body text that happens to be a heading,
          so it takes the body role at semibold rather than a fifth size.
        */}
        <h3 className="text-body font-semibold mb-2">{errorTitle}</h3>
        <p className="text-body text-muted-foreground max-w-md mx-auto mb-6">{errorBody}</p>
        {/*
          No `disabled`/spinner on this button, deliberately. Retrying a query that
          holds no data resets its status to `pending` (query-core only preserves
          `error` when `data !== undefined`), so this whole branch unmounts the instant
          the retry starts and the loading spinner above takes over for the ~3s of
          backoff — verified in the browser: the button is gone by 100ms and back at 3s,
          with the spinner announcing "Loading" throughout. `isRefetching` is therefore
          always false wherever this button exists, and a disabled state keyed off it
          could never render.
        */}
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 min-h-[44px] px-6 rounded-full bg-primary text-primary-foreground text-body font-semibold hover:bg-[#a855f7] transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> {retryLabel}
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="surface rounded-2xl py-12 px-6 text-center">
        <h3 className="text-body font-semibold mb-2">{emptyTitle}</h3>
        <p className="text-body text-muted-foreground max-w-md mx-auto">{emptyBody}</p>
        {emptyAction && <div className="mt-6">{emptyAction}</div>}
      </div>
    );
  }

  return <>{children}</>;
}
