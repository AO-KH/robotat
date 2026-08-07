import { describe, it, expect, beforeEach } from "vitest";
import {
  track,
  drainBackgroundWork,
  pendingBackgroundWork,
  resetBackgroundWork,
} from "../server/lib/background";

/**
 * The register behind the fire-and-forget booking delivery. Two properties matter and
 * they pull against each other: shutdown must wait long enough that a real SMTP send
 * finishes, and must not wait at all for a delivery that has wedged.
 */
describe("background work register", () => {
  beforeEach(() => {
    resetBackgroundWork();
  });

  it("drains when the tracked work settles", async () => {
    let done = false;
    track(
      new Promise<void>((resolve) =>
        setTimeout(() => {
          done = true;
          resolve();
        }, 50),
      ),
    );
    expect(pendingBackgroundWork()).toBe(1);

    const abandoned = await drainBackgroundWork(2_000);

    expect(abandoned).toBe(0);
    // The assertion that matters: the work had actually finished, not merely been waited on.
    expect(done).toBe(true);
  });

  it("returns 0 immediately when nothing is outstanding", async () => {
    const started = Date.now();
    await expect(drainBackgroundWork(5_000)).resolves.toBe(0);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("gives up on work that hangs past the timeout, and says how much", async () => {
    track(new Promise<void>(() => {})); // never settles — a delivery wedged on a dead SMTP host
    track(Promise.resolve());

    const started = Date.now();
    const abandoned = await drainBackgroundWork(100);
    const elapsed = Date.now() - started;

    expect(abandoned).toBe(1); // the resolved one deregistered; the wedged one did not
    expect(elapsed).toBeLessThan(2_000); // and it did not hold the process for the full wait
  });

  it("forgets work once it settles, so a later drain is instant", async () => {
    track(Promise.resolve());
    await drainBackgroundWork(1_000);
    expect(pendingBackgroundWork()).toBe(0);
  });

  it("returns the very same promise, so a call site reads unchanged", () => {
    const promise = Promise.resolve("delivered");
    expect(track(promise)).toBe(promise);
  });

  it("hands a rejection back to the caller rather than converting it to success", async () => {
    const boom = new Error("smtp refused");
    const returned = track(Promise.reject(boom));

    await expect(returned).rejects.toBe(boom);
  });

  it("stops tracking work that failed, so a failure cannot pin the shutdown open", async () => {
    track(Promise.reject(new Error("smtp refused")));

    await expect(drainBackgroundWork(500)).resolves.toBe(0);
    expect(pendingBackgroundWork()).toBe(0);
  });
});
