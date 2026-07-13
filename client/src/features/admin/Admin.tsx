import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck, MapPin, Mail, Phone, Building2, Calendar, BarChart3 } from "lucide-react";
import { ASSESSMENT_STATUSES, type Assessment, type AssessmentStatus } from "@shared/schema";
import { useCurrentUser } from "@/features/auth/use-auth";
import { useAllAssessments, useUpdateAssessment } from "@/features/admin/use-admin";
import { useI18n } from "@/i18n";
import { useSeo } from "@/lib/seo";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  scheduled: "bg-[#a855f7]/10 text-[#c084fc] border-[#a855f7]/20",
  completed: "bg-[#5eead4]/10 text-[#5eead4] border-[#5eead4]/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
};

function fmtDate(v: string | Date | null, locale: string): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

/** ISO string → value for <input type="datetime-local"> (local time, no seconds). */
function toLocalInput(iso: string | Date | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AssessmentCard({ a }: { a: Assessment }) {
  const { mutate, isPending } = useUpdateAssessment();
  const { t, lang } = useI18n();
  const locale = lang === "ar" ? "ar" : "en-US";
  const [status, setStatus] = useState<AssessmentStatus>(a.status as AssessmentStatus);
  const [scheduledAt, setScheduledAt] = useState<string>(toLocalInput(a.scheduledAt));

  const dirty = status !== a.status || toLocalInput(a.scheduledAt) !== scheduledAt;

  const save = () => {
    mutate({
      id: a.id,
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
  };

  return (
    <div className="glass-card rounded-2xl border border-white/10 p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="font-semibold">#{a.id} · {a.name}</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                STATUS_STYLES[a.status] ?? "bg-white/10 text-muted-foreground border-white/10"
              }`}
            >
              {t(`status.${a.status}`)}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{t("admin.requested", { date: fmtDate(a.createdAt, locale) })}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm mb-5">
        <span className="flex items-center gap-2 text-muted-foreground"><Mail className="w-3.5 h-3.5 shrink-0" /> {a.email}</span>
        {a.phone && <span className="flex items-center gap-2 text-muted-foreground"><Phone className="w-3.5 h-3.5 shrink-0" /> {a.phone}</span>}
        {a.company && <span className="flex items-center gap-2 text-muted-foreground"><Building2 className="w-3.5 h-3.5 shrink-0" /> {a.company}</span>}
        {a.landSize && <span className="flex items-center gap-2 text-muted-foreground"><span className="font-mono text-[11px]">HA</span> {a.landSize} ha</span>}
        {a.location && <span className="flex items-center gap-2 text-muted-foreground col-span-full truncate"><MapPin className="w-3.5 h-3.5 shrink-0" /> {a.location}</span>}
      </div>

      {a.message && <p className="text-sm text-muted-foreground bg-black/20 rounded-xl p-3 mb-5">{a.message}</p>}

      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-white/5">
        <label className="flex-1">
          <span className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t("admin.statusLabel")}</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AssessmentStatus)}
            className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-foreground focus:outline-none focus:border-primary"
          >
            {ASSESSMENT_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-[#15101f]">{t(`status.${s}`)}</option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          <span className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{t("admin.scheduledVisit")}</span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-foreground focus:outline-none focus:border-primary [color-scheme:dark]"
          />
        </label>
        <div className="flex items-end">
          <button
            onClick={save}
            disabled={!dirty || isPending}
            className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-medium hover:bg-[#a855f7] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("admin.update")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { t } = useI18n();
  const [filter, setFilter] = useState<AssessmentStatus | "all">("all");
  useSeo({ title: "Admin", noindex: true });
  const { data: assessments = [], isLoading } = useAllAssessments(filter === "all" ? undefined : filter);

  // Guard: only staff. Bounce everyone else.
  useEffect(() => {
    if (userLoading) return;
    if (!user) setLocation("/auth");
    else if (user.role !== "staff") setLocation("/dashboard");
  }, [userLoading, user, setLocation]);

  if (userLoading || !user || user.role !== "staff") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filters: (AssessmentStatus | "all")[] = ["all", ...ASSESSMENT_STATUSES];

  return (
    <div className="min-h-screen pt-28 pb-28 md:pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-7 h-7 text-[#c084fc]" />
            <h1 className="text-3xl md:text-4xl font-bold">{t("admin.assessments")}</h1>
          </div>
          <Link
            href="/admin/analytics"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 text-sm font-medium hover:border-[#c084fc] hover:text-[#c084fc] transition-colors whitespace-nowrap"
          >
            <BarChart3 className="w-4 h-4" /> {t("admin.analytics")}
          </Link>
        </div>
        <p className="text-muted-foreground mb-8">{t("admin.manageBookings")}</p>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-2 mb-8">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
              }`}
            >
              {t(`status.${f}`)}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : assessments.length === 0 ? (
          <div className="glass-card rounded-2xl border border-white/10 p-12 text-center">
            <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="font-medium">{t("admin.noBookings")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("admin.bookingsAppear")}</p>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {assessments.map((a) => (
              <AssessmentCard key={a.id} a={a} />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
