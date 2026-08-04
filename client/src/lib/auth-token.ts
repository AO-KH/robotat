/**
 * Bearer token store for the native app.
 *
 * The website authenticates with an HTTP-only session cookie and never touches this.
 * The Capacitor webview cannot rely on cookies from the capacitor://localhost origin,
 * so it authenticates with `Authorization: Bearer …` from POST /api/auth/token.
 *
 * The token lives in memory. Persisting it across app launches sits behind an adapter
 * on purpose: on iOS it belongs in the Keychain, which needs a native plugin and a
 * device to verify. localStorage would be the wrong answer — any script running in
 * the webview can read it.
 */
export interface TokenPersistence {
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
}

let token: string | null = null;
let persistence: TokenPersistence | null = null;

export function getAuthToken(): string | null {
  return token;
}

/** Set (or clear, with null) the token. Persistence is best-effort and never throws. */
export function setAuthToken(next: string | null): void {
  token = next;
  if (!persistence) return;
  const write = next === null ? persistence.clear() : persistence.save(next);
  void write.catch(() => {
    /* a failed write must not break sign-in; the in-memory token still works */
  });
}

export function registerTokenPersistence(impl: TokenPersistence): void {
  persistence = impl;
}

/** Load a previously persisted token at startup. Returns null when there is none. */
export async function restoreAuthToken(): Promise<string | null> {
  if (!persistence) return null;
  try {
    token = await persistence.load();
  } catch {
    token = null;
  }
  return token;
}

/** Test seam: drop the token and any registered persistence. */
export function resetAuthTokenForTests(): void {
  token = null;
  persistence = null;
}
