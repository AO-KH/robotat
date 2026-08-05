import { Component, type ErrorInfo, type ReactNode } from "react";

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
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="surface rounded-2xl py-12 px-6 max-w-md">
          <h1 className="text-body font-semibold mb-2">Something went wrong</h1>
          <p className="text-body text-muted-foreground mb-6">
            The page didn't load correctly. Reloading usually fixes it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="min-h-[44px] px-6 rounded-full bg-primary text-primary-foreground text-body font-semibold hover:bg-[#a855f7] transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
