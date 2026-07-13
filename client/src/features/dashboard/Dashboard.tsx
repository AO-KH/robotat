import { motion } from "framer-motion";
import { LayoutDashboard, Settings, LogOut, ChevronRight, ClipboardList, Loader2, MapPin, Plus } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useCurrentUser, useLogout } from "@/features/auth/use-auth";
import { useMyAssessments } from "@/features/booking/use-assessments";
import { useDemoModal } from "@/features/booking/DemoModalContext";
import { useI18n } from "@/i18n";
import { useSeo } from "@/lib/seo";
import { useEffect } from "react";

const statusStyles: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400",
  scheduled: "bg-[#a855f7]/10 text-[#c084fc]",
  completed: "bg-[#5eead4]/10 text-[#5eead4]",
  cancelled: "bg-red-500/10 text-red-400",
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: assessments = [], isLoading: listLoading } = useMyAssessments(!!user);
  const logout = useLogout();
  const { openModal } = useDemoModal();
  const { t, lang } = useI18n();
  useSeo({ title: "Dashboard", noindex: true });

  const formatDate = (value: string | Date | null): string => {
    if (!value) return "—";
    return new Date(value).toLocaleDateString(lang === "ar" ? "ar" : "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Protect the route: bounce to /auth if not signed in.
  useEffect(() => {
    if (!userLoading && !user) setLocation("/auth");
  }, [userLoading, user, setLocation]);

  const onSignOut = () => logout.mutate(undefined, { onSuccess: () => setLocation("/") });

  if (userLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pendingCount = assessments.filter((a) => a.status === "pending").length;

  return (
    <div className="min-h-screen pt-28 pb-28 md:pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl font-bold mb-2">{t("dashboard.greeting", { name: user.name.split(" ")[0] })}</h1>
            <p className="text-muted-foreground">{t("dashboard.subtitle")}</p>
          </div>
          <button
            onClick={onSignOut}
            disabled={logout.isPending}
            className="flex items-center gap-2 px-6 py-3 rounded-full border border-white/10 hover:bg-white/10 transition-all disabled:opacity-70"
          >
            <LogOut className="w-5 h-5" /> {t("dashboard.signOut")}
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-10">
          {[
            { label: t("dashboard.totalRequests"), value: String(assessments.length), icon: ClipboardList, color: "text-primary" },
            { label: t("dashboard.awaitingScheduling"), value: String(pendingCount), icon: Loader2, color: "text-[#c084fc]" },
            { label: t("dashboard.account"), value: user.email, icon: Settings, color: "text-[#5eead4]", wide: true },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`glass-card p-6 rounded-3xl border border-white/10 ${stat.wide ? "col-span-2 md:col-span-1" : ""}`}
            >
              <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-4 ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <p className={`font-bold ${stat.wide ? "text-lg break-all" : "text-3xl"}`}>{stat.value}</p>
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Assessments list */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <LayoutDashboard className="w-6 h-6 text-primary" /> {t("dashboard.myAssessments")}
              </h2>
              <button
                onClick={openModal}
                className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-[#a855f7] transition-colors"
              >
                <Plus className="w-4 h-4" /> {t("dashboard.book")}
              </button>
            </div>

            {listLoading ? (
              <div className="glass-card rounded-3xl border border-white/10 p-10 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : assessments.length === 0 ? (
              <div className="glass-card rounded-3xl border border-white/10 p-10 text-center">
                <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                <p className="font-medium mb-1">{t("dashboard.noAssessments")}</p>
                <p className="text-sm text-muted-foreground mb-6">{t("dashboard.noAssessmentsSub")}</p>
                <button
                  onClick={openModal}
                  className="px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium hover:bg-[#a855f7] transition-colors"
                >
                  {t("dashboard.bookAssessment")}
                </button>
              </div>
            ) : (
              <div className="glass-card rounded-3xl border border-white/10 divide-y divide-white/5 overflow-hidden">
                {assessments.map((a) => (
                  <Link
                    key={a.id}
                    href={`/assessments/${a.id}`}
                    className="p-5 md:p-6 flex items-start justify-between gap-4 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-semibold">{t("dashboard.assessment")} #{a.id}</span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            statusStyles[a.status] ?? "bg-white/10 text-muted-foreground"
                          }`}
                        >
                          {t(`status.${a.status}`)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {a.landSize ? `${a.landSize} ha` : t("dashboard.siteVisit")}
                        {a.company ? ` · ${a.company}` : ""}
                      </p>
                      {a.location && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 shrink-0" /> {a.location}
                        </p>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(a.createdAt)} <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="w-6 h-6 text-primary" /> {t("dashboard.quickActions")}
            </h2>
            <div className="space-y-4">
              <button
                onClick={openModal}
                className="w-full p-6 rounded-3xl bg-primary text-primary-foreground font-bold text-start hover:bg-[#a855f7] transition-colors flex justify-between items-center"
              >
                {t("dashboard.bookAssessment")} <ChevronRight className="w-5 h-5 rtl:rotate-180" />
              </button>
              <button
                onClick={() => setLocation("/profile")}
                className="w-full p-6 rounded-3xl bg-white/5 border border-white/10 text-foreground font-bold text-start hover:bg-white/10 transition-all flex justify-between items-center"
              >
                {t("dashboard.accountSettings")} <ChevronRight className="w-5 h-5 rtl:rotate-180" />
              </button>
              <button
                onClick={() => setLocation("/fleet")}
                className="w-full p-6 rounded-3xl bg-white/5 border border-white/10 text-foreground font-bold text-start hover:bg-white/10 transition-all flex justify-between items-center"
              >
                {t("dashboard.browseProducts")} <ChevronRight className="w-5 h-5 rtl:rotate-180" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
