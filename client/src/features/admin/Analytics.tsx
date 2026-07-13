import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Loader2, BarChart3, Eye, Users, ArrowLeft } from "lucide-react";
import { useCurrentUser } from "@/features/auth/use-auth";
import { useAnalytics } from "@/features/admin/use-admin";
import { useSeo } from "@/lib/seo";

const PATH_LABELS: Record<string, string> = {
  "/": "Home",
  "/fleet": "Products",
  "/services": "Services",
  "/auth": "Sign in",
  "/dashboard": "Dashboard",
  "/admin": "Admin",
  "/admin/analytics": "Analytics",
  "/profile": "Account settings",
};

const FUNNEL_STEPS = [
  { key: "opened", label: "Opened booking" },
  { key: "whatsapp", label: "Chose WhatsApp" },
  { key: "email", label: "Chose Email" },
  { key: "submitted", label: "Submitted request" },
] as const;

export default function Analytics() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: summary, isLoading } = useAnalytics();
  useSeo({ title: "Analytics", noindex: true });

  useEffect(() => {
    if (userLoading) return;
    if (!user) setLocation("/auth");
    else if (user.role !== "staff") setLocation("/dashboard");
  }, [userLoading, user, setLocation]);

  if (userLoading || !user || user.role !== "staff" || isLoading || !summary) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const funnelMax = Math.max(summary.funnel.opened, 1);
  const pathMax = Math.max(...summary.topPaths.map((p) => p.views), 1);

  return (
    <div className="min-h-screen pt-28 pb-28 md:pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> Back to assessments
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <BarChart3 className="w-7 h-7 text-[#c084fc]" />
          <h1 className="text-3xl md:text-4xl font-bold">Analytics</h1>
        </div>

        {/* Top-line stats */}
        <div className="grid grid-cols-2 gap-4 md:gap-6 mb-8">
          {[
            { label: "Page views", value: summary.totalPageViews, icon: Eye },
            { label: "Unique visitors", value: summary.uniqueVisitors, icon: Users },
          ].map((s) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-3xl border border-white/10 p-6">
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-4 text-[#c084fc]">
                <s.icon className="w-6 h-6" />
              </div>
              <p className="text-3xl font-bold">{s.value.toLocaleString()}</p>
              <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Top pages */}
          <div className="glass-card rounded-3xl border border-white/10 p-6">
            <h2 className="text-lg font-semibold mb-5">Top pages</h2>
            {summary.topPaths.length === 0 ? (
              <p className="text-sm text-muted-foreground">No views yet.</p>
            ) : (
              <div className="space-y-3">
                {summary.topPaths.map((p) => (
                  <div key={p.path}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="truncate">{PATH_LABELS[p.path] ?? p.path}</span>
                      <span className="text-muted-foreground font-mono text-xs">{p.views}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(p.views / pathMax) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Booking funnel */}
          <div className="glass-card rounded-3xl border border-white/10 p-6">
            <h2 className="text-lg font-semibold mb-5">Booking funnel</h2>
            <div className="space-y-3">
              {FUNNEL_STEPS.map((step) => {
                const value = summary.funnel[step.key];
                const pct = summary.funnel.opened > 0 ? Math.round((value / summary.funnel.opened) * 100) : 0;
                return (
                  <div key={step.key}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{step.label}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {value}
                        {step.key !== "opened" && summary.funnel.opened > 0 ? ` · ${pct}%` : ""}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-[#c084fc] rounded-full" style={{ width: `${(value / funnelMax) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-6">
          First-party, anonymous analytics — no third-party trackers, no IP addresses stored.
        </p>
      </div>
    </div>
  );
}
