import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { trackPageView } from "@/lib/analytics";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";

// Context & Layout
import { I18nProvider } from "@/i18n";
import { DemoModalProvider } from "@/features/booking/DemoModalContext";
import { Navigation } from "@/components/layout/Navigation";
import { Footer } from "@/components/layout/Footer";
import { BackgroundMesh } from "@/components/layout/BackgroundMesh";
import { BookDemoModal } from "@/features/booking/BookDemoModal";

// Pages
import Home from "@/features/marketing/Home";
import Services from "@/features/marketing/Services";
import Fleet from "@/features/marketing/Fleet";
import Auth from "@/features/auth/Auth";
import ForgotPassword from "@/features/auth/ForgotPassword";
import ResetPassword from "@/features/auth/ResetPassword";
import VerifyEmail from "@/features/auth/VerifyEmail";
import Profile from "@/features/auth/Profile";
import Dashboard from "@/features/dashboard/Dashboard";
import AssessmentDetail from "@/features/dashboard/AssessmentDetail";
import Admin from "@/features/admin/Admin";
import Analytics from "@/features/admin/Analytics";
import NotFound from "@/features/marketing/not-found";

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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/services" component={Services} />
      <Route path="/fleet" component={Fleet} />
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
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TooltipProvider>
          <DemoModalProvider>
            <div className="min-h-screen flex flex-col relative">
              <BackgroundMesh />
              <ScrollToTop />
              <Navigation />
              <main className="flex-1">
                <Router />
              </main>
              <Footer />
              <BookDemoModal />
            </div>
            <Toaster />
          </DemoModalProvider>
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
