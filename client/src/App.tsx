import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { trackPageView } from "@/lib/analytics";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MotionConfig } from "framer-motion";
import { useEffect, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Context & Layout
import { I18nProvider } from "@/i18n";
import { useCurrentUser } from "@/features/auth/use-auth";
import { initPush } from "@/lib/push";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DemoModalProvider } from "@/features/booking/DemoModalContext";
import { Navigation } from "@/components/layout/Navigation";
import { BackgroundMesh } from "@/components/layout/BackgroundMesh";
import { BookDemoModal } from "@/features/booking/BookDemoModal";

// Pages
import Home from "@/features/marketing/Home";
import Services from "@/features/marketing/Services";
import Fleet from "@/features/marketing/Fleet";
// Eagerly imported, unlike the admin screens below: an App Store reviewer opens these
// two, and a lazy chunk fetch is one more thing that can fail in front of them. Support
// has a second reason — whoever opens it is disproportionately likely to be there
// because something is already failing, which is the worst moment to need a network
// round-trip just to render the page.
import Privacy from "@/features/marketing/Privacy";
import Support from "@/features/marketing/Support";
import Auth from "@/features/auth/Auth";
import ForgotPassword from "@/features/auth/ForgotPassword";
import ResetPassword from "@/features/auth/ResetPassword";
import VerifyEmail from "@/features/auth/VerifyEmail";
import Profile from "@/features/auth/Profile";
import Dashboard from "@/features/dashboard/Dashboard";
import AssessmentDetail from "@/features/dashboard/AssessmentDetail";
import NotFound from "@/features/marketing/not-found";

/**
 * The staff screens are the only routes almost nobody who loads this app will visit,
 * so they are the only ones split out of the main bundle. Vite emits them as separate
 * chunks fetched on demand.
 *
 * The saving is modest on the web — the two pages are about 20 kB of source and pull
 * in no charting library. It matters more for the iOS build, where the bundle is
 * shipped inside the app: a customer downloads staff tooling they can never open, and
 * an App Store reviewer meets screens they cannot reach. Splitting here is also the
 * seam that would let a native build drop these routes entirely, without a second
 * app, a shared package, or two copies of the design system to keep in step.
 */
const Admin = lazy(() => import("@/features/admin/Admin"));
const Analytics = lazy(() => import("@/features/admin/Analytics"));

// Scroll to top + record a page view on route change
function ScrollToTop() {
  const [pathname] = useLocation();

  useEffect(() => {
    trackPageView(pathname);

    const hash = window.location.hash;
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

/**
 * Registers this device for push once somebody is signed in.
 *
 * Driven off the cached user rather than called from each auth hook, because all three
 * moments the registration has to happen — signing in, signing up, and launching with a
 * session already restored — are the same event seen from here: `ME_KEY` going from
 * "nobody" to a user. One wiring point, no path left out.
 *
 * Keyed on the id so a profile edit, which rewrites the cached user object, does not
 * re-run it. `initPush` is a no-op off-device and never throws, so this costs the web
 * a single function call and can fail no page.
 */
function PushRegistrar() {
  const { data: user } = useCurrentUser();
  const userId = user?.id;

  useEffect(() => {
    if (userId === undefined) return;
    void initPush();
  }, [userId]);

  return null;
}

/**
 * Shown while a lazily-loaded route's chunk is in flight. Matches QueryState's loading
 * branch — same spinner, same `role="status"` live region — so a screen reader hears
 * the same thing whether it is waiting on code or on data.
 */
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/services" component={Services} />
      <Route path="/fleet" component={Fleet} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/support" component={Support} />
      <Route path="/auth" component={Auth} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/profile" component={Profile} />
      <Route path="/assessments/:id" component={AssessmentDetail} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/analytics" component={Analytics} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [pathname] = useLocation();

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <I18nProvider>
          <TooltipProvider>
            <DemoModalProvider>
              <div className="min-h-screen flex flex-col relative">
                <BackgroundMesh />
                <ScrollToTop />
                <PushRegistrar />
                <Navigation />
                <main className="flex-1">
                  {/* Keyed by route: a caught render error doesn't clear itself on prop
                      changes, so without this the fallback would stay stuck even after
                      navigating to a page that renders fine. */}
                  <ErrorBoundary key={pathname}>
                    {/* Suspense sits inside the boundary, so a chunk that fails to load
                        — a stale hash after a deploy, a dropped connection mid-fetch —
                        surfaces as the error card rather than an unresolved promise
                        leaving the page blank. */}
                    <Suspense fallback={<RouteLoading />}>
                      <Router />
                    </Suspense>
                  </ErrorBoundary>
                </main>
                <BookDemoModal />
              </div>
              <Toaster />
            </DemoModalProvider>
          </TooltipProvider>
        </I18nProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}

export default App;
