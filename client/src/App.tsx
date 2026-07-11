import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";

// Context & Layout
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
import Dashboard from "@/features/dashboard/Dashboard";
import NotFound from "@/features/marketing/not-found";

// Scroll to top on route change
function ScrollToTop() {
  const [pathname] = useLocation();
  
  useEffect(() => {
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
      <Route path="/dashboard" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}

export default App;
