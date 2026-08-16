import { createRoot } from "react-dom/client";
import App from "./App";
import { installApiBase } from "./lib/api-base";
import { restoreAuthToken } from "./lib/auth-token";
import "./index.css";

// Point relative /api calls at the deployed backend when running in the native
// shell (VITE_API_URL set). No-op on the web. Must run before any data fetching.
installApiBase();

/**
 * Restore the stored bearer token *before* React mounts.
 *
 * The fetch shim reads `getAuthToken()` at request time, and `useCurrentUser` fires
 * `/api/auth/me` on its first render. If restoration happened in an effect, that first
 * request would go out with no Authorization header, come back 401, and the app would
 * show a signed-out shell to someone holding a perfectly good token. Awaiting here
 * removes the race entirely rather than papering over it with a loading flag.
 *
 * On the web nothing is registered, so this settles on the first microtask and costs
 * nothing measurable. In the native shell it is one Keychain read before first paint.
 *
 * Failures are swallowed inside `restoreAuthToken`, so a broken store starts the app
 * signed-out instead of not starting it at all.
 */
/**
 * Take down the first-paint splash in `index.html` once React has rendered.
 *
 * Two nested frames, not one. `render()` only schedules the work; after the first
 * frame React has committed to the DOM but the browser has not necessarily drawn
 * it, so fading on frame one can uncover an empty root for a beat. Waiting for the
 * second frame means the fade starts against pixels that are actually on screen.
 *
 * The node is removed on `transitionend`, with a timer as a backstop — that event
 * never fires when the transition is off (`prefers-reduced-motion`), and a splash
 * that stays is far worse than one that leaves early, since it covers the whole app.
 */
function dismissSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      splash.classList.add("is-done");
      splash.addEventListener("transitionend", () => splash.remove(), { once: true });
      setTimeout(() => splash.remove(), 600);
    }),
  );
}

async function boot() {
  await restoreAuthToken();
  createRoot(document.getElementById("root")!).render(<App />);
  dismissSplash();
}

void boot();
