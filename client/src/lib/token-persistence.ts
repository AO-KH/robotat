import type { TokenPersistence } from "./auth-token";

/**
 * Adapters that give the bearer token somewhere to live across app launches.
 *
 * `auth-token.ts` deliberately keeps the token in memory and exposes a
 * `TokenPersistence` seam instead of picking a store itself, because the right store
 * is platform-specific: on iOS it is the Keychain, which needs a native plugin and a
 * device to verify. This module is that seam's implementations.
 *
 * localStorage is not among them, and that is not an oversight. The token is a 30-day
 * credential granting full account access, and anything that can run script in the
 * webview can read localStorage. The Keychain is the platform's answer to exactly this.
 */

/** The shape every Capacitor secure-storage plugin exposes, narrowed to what we use. */
export interface SecureStore {
  get(options: { key: string }): Promise<{ value: string | null } | null>;
  set(options: { key: string; value: string }): Promise<unknown>;
  remove(options: { key: string }): Promise<unknown>;
}

const TOKEN_KEY = "robotat.auth.token";

/**
 * Wrap a Capacitor secure-storage plugin as a `TokenPersistence`.
 *
 * Takes the plugin as an argument rather than importing one, so this is a pure
 * function that can be tested against a fake — the plugin itself cannot run outside a
 * real device, but everything around it can be proven here.
 *
 * `load` swallows read failures and returns null: a Keychain miss on first launch and
 * a Keychain error are the same thing from the caller's point of view — no usable
 * token — and the app must start signed-out rather than not start at all.
 */
export function secureTokenPersistence(store: SecureStore): TokenPersistence {
  return {
    async load() {
      try {
        const result = await store.get({ key: TOKEN_KEY });
        return result?.value ?? null;
      } catch {
        return null;
      }
    },
    async save(token: string) {
      await store.set({ key: TOKEN_KEY, value: token });
    },
    async clear() {
      await store.remove({ key: TOKEN_KEY });
    },
  };
}

/**
 * An in-memory stand-in, used by tests and as the honest default on platforms with no
 * secure store. It survives a route change but not a reload, which is exactly the
 * current behaviour — so registering it changes nothing except making the boot path
 * exercise the same code in every environment.
 */
export function memoryTokenPersistence(): TokenPersistence {
  let held: string | null = null;
  return {
    async load() {
      return held;
    },
    async save(token: string) {
      held = token;
    },
    async clear() {
      held = null;
    },
  };
}
