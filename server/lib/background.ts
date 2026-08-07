/**
 * A register of work that outlives the response that started it.
 *
 * Booking delivery is deliberately fire-and-forget: `deliverAssessment` is kicked off
 * after the 201 is written, so a slow SMTP server can never turn a saved booking into a
 * failed one for the customer. The cost of that choice is that the work is invisible —
 * nothing holds a reference to it, so shutdown has no way to know it is still running,
 * and seconds of SMTP and HTTPS get cut off mid-flight when the process exits.
 *
 * That matters more here than the phrase "background work" suggests. WhatsApp and email
 * ARE how a booking reaches the business; if they are severed, the customer sees a
 * success screen for an appointment nobody will ever hear about, and the `.catch(() => {})`
 * at the call site means there is not even a log line to find afterwards.
 *
 * So: `track()` at the call site, `drainBackgroundWork()` at shutdown. `track` is a
 * pass-through — it returns the promise it was handed, unchanged — so wrapping a call
 * site cannot change what that call site does.
 */

import { log } from "./log";

const pending = new Set<Promise<unknown>>();

/**
 * Register a fire-and-forget promise so shutdown can wait for it, and return it as-is.
 *
 * A failure is logged rather than absorbed. Watching a promise for its settlement also
 * marks it handled, so anything passed through here stops reaching the process-wide
 * `unhandledRejection` hook — and that hook shuts the server down. For work on this path
 * that trade is the right way round: a WhatsApp send that fails should leave a line in
 * the log, not take the site with it. What it must not do is disappear, which is the
 * state this whole module exists to get out of.
 *
 * The promise handed back is the original, so a caller that does want to await or catch
 * it is unaffected.
 */
export function track<T extends Promise<unknown>>(promise: T): T {
  pending.add(promise);
  const forget = () => {
    pending.delete(promise);
  };
  void promise.then(forget, (err) => {
    forget();
    log(`background task failed: ${String(err)}`, "background");
  });
  return promise;
}

/** How many tracked promises have not settled yet. Exposed for tests and logging. */
export function pendingBackgroundWork(): number {
  return pending.size;
}

/**
 * Wait for everything outstanding to settle, or for `timeoutMs` to elapse.
 *
 * Resolves with the number of tasks still pending — 0 means the drain was clean, and
 * anything else is work that was abandoned and is worth a log line. The timeout is the
 * point: one wedged delivery must not be able to hold a deploy open indefinitely, so
 * this always resolves, never hangs.
 */
export async function drainBackgroundWork(timeoutMs: number): Promise<number> {
  if (pending.size === 0) return 0;

  const settled = Promise.allSettled(Array.from(pending));
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, Math.max(0, timeoutMs));
    // Unref'd so a drain that is already finished cannot keep the event loop alive
    // waiting out the rest of its own budget.
    timer.unref?.();
  });

  try {
    await Promise.race([settled, expired]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  return pending.size;
}

/** Test-only: forget everything currently tracked, so cases cannot leak into each other. */
export function resetBackgroundWork(): void {
  pending.clear();
}
