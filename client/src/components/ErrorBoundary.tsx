import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Copy lives here, not in the i18n dictionaries, and the language is read off the page
 * rather than out of `useI18n`. This component's whole job is to render when something
 * below it has already thrown — and the thing that threw may well be the i18n provider
 * itself, in which case `t()` would throw again and take the fallback down with it. No
 * hook, no context, nothing here can fail even if every provider is broken.
 */
const COPY = {
  en: {
    title: "Something went wrong",
    body: "The page didn't load correctly. Reloading usually fixes it.",
    button: "Reload",
  },
  ar: {
    title: "حدث خطأ ما",
    body: "لم يتم تحميل الصفحة بشكل صحيح. غالبًا ما تُصلح إعادة التحميل المشكلة.",
    button: "إعادة التحميل",
  },
} as const;

/**
 * `document.documentElement.lang` is the obvious source — I18nProvider sets it — but on
 * its own it gets this wrong exactly when it matters. If the throw happens during the
 * initial mount, the provider never commits, so its effect never runs and the attribute
 * is still the static `lang="en"` from index.html: measured, an Arabic user got the
 * English fallback. So we fall back to the key the provider persists to, which is also
 * what it initialises its own state from and is readable synchronously at any moment.
 * localStorage can throw (private mode, disabled storage), hence the try/catch — this
 * function must never be the thing that breaks the error screen.
 */
function isArabic(): boolean {
  if (document.documentElement.lang === "ar") return true;
  try {
    return localStorage.getItem("robotat-lang") === "ar";
  } catch {
    return false;
  }
}

/**
 * A render-time throw anywhere below this point takes out only this subtree, not the
 * whole document. Without it React unmounts everything and the user gets a white
 * screen with no way forward — which on an App Store submission reads as a crash.
 *
 * Class component because React exposes no hook equivalent for componentDidCatch.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ui] unhandled render error", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const ar = isArabic();
    const copy = ar ? COPY.ar : COPY.en;
    return (
      // `dir` from the same source, so the Arabic fallback reads right-to-left even
      // though whatever normally sets `dir` on <html> may be what just broke.
      <div dir={ar ? "rtl" : "ltr"} className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="surface rounded-2xl py-12 px-6 max-w-md">
          <h1 className="text-body font-semibold mb-2">{copy.title}</h1>
          <p className="text-body text-muted-foreground mb-6">{copy.body}</p>
          <button
            onClick={() => window.location.reload()}
            className="min-h-[44px] px-6 rounded-full bg-primary text-primary-foreground text-body font-semibold hover:bg-[#a855f7] transition-colors"
          >
            {copy.button}
          </button>
        </div>
      </div>
    );
  }
}
