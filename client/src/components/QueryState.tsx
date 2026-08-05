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
  isError,
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
  isError: boolean;
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

  if (isError) {
    return (
      <div className="surface rounded-2xl py-12 px-6 text-center" role="alert">
        <h3 className="text-heading mb-2">{errorTitle}</h3>
        <p className="text-body text-muted-foreground max-w-md mx-auto mb-6">{errorBody}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 min-h-[44px] px-6 rounded-full bg-primary text-primary-foreground text-body hover:bg-[#a855f7] transition-colors"
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
        <h3 className="text-heading mb-2">{emptyTitle}</h3>
        <p className="text-body text-muted-foreground max-w-md mx-auto">{emptyBody}</p>
        {emptyAction && <div className="mt-6">{emptyAction}</div>}
      </div>
    );
  }

  return <>{children}</>;
}
