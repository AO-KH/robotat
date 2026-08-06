/**
 * A failed HTTP response, carrying its status alongside whatever the server said.
 *
 * The status is the point. It is a stable contract — 409 means "already exists" for as
 * long as the endpoint exists — while the English prose sent with it is not. Deciding
 * what to show a user by matching that prose would break silently the first time
 * someone rewords a message, and it can only ever match English, which is how every
 * error toast in this app ended up English no matter what language the UI was in.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Build an `ApiError` from a non-ok `Response`, preferring the server's own `message`.
 * `fallback` covers a body that isn't our JSON envelope at all — a proxy's HTML error
 * page, say — and should itself be translated, since it can reach a toast.
 */
export async function apiError(res: Response, fallback: string): Promise<ApiError> {
  let message = fallback;
  try {
    const body = await res.json();
    if (typeof body?.message === "string") message = body.message;
  } catch {
    /* not JSON — keep the fallback */
  }
  return new ApiError(res.status, message);
}

/**
 * The user-facing text for a failed request.
 *
 * Each call site passes the statuses its endpoint actually produces, mapped to already
 * translated copy, so the mapping lives beside the operation whose meaning it encodes
 * rather than in one distant table that has to know every endpoint.
 *
 * Anything not listed — a 500, a gateway error, a network failure that never reached
 * the server — falls through to whatever the error itself carries. That keeps an
 * unforeseen problem visible instead of flattening it into a generic line, which is
 * the failure mode of a catch-all default.
 */
export function errorText(err: unknown, byStatus: Record<number, string>): string {
  if (err instanceof ApiError) {
    const copy = byStatus[err.status];
    if (copy) return copy;
  }
  return err instanceof Error ? err.message : String(err);
}
