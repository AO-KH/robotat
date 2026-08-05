import { useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Mail, Phone, Building2, MapPin, Calendar, Check, X, Clock } from "lucide-react";
import type { Assessment } from "@shared/schema";
import { useCurrentUser } from "@/features/auth/use-auth";
import { useAssessment } from "@/features/booking/use-assessments";
import { useI18n } from "@/i18n";
import { QueryState } from "@/components/QueryState";
import { useSeo } from "@/lib/seo";
import { riseOnMount } from "@/lib/motion";

const STEPS = [
  { key: "pending", labelKey: "detail.stepRequested", icon: Clock },
  { key: "scheduled", labelKey: "detail.stepScheduled", icon: Calendar },
  { key: "completed", labelKey: "detail.stepCompleted", icon: Check },
] as const;

function fmt(v: string | Date | null, locale: string, withTime = false): string {
  if (!v) return "—";
  return new Date(v).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

function Timeline({ a }: { a: Assessment }) {
  const { t } = useI18n();
  if (a.status === "cancelled") {
    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
        <X className="w-5 h-5 shrink-0" />
        <span className="text-body font-normal">{t("detail.cancelledMsg")}</span>
      </div>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.key === a.status);

  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        const Icon = step.icon;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center border-2 transition-colors ${
                  done || current
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-transparent border-white/15 text-muted-foreground"
                } ${current ? "shadow-[0_0_16px_rgba(168,85,247,0.5)]" : ""}`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className={`text-label font-normal ${done || current ? "text-foreground" : "text-muted-foreground"}`}>
                {t(step.labelKey)}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 -mt-6 ${i < currentIdx ? "bg-primary" : "bg-white/15"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The loaded booking. Split out so the page shell can render before `a` exists. */
function AssessmentCard({ a }: { a: Assessment }) {
  const { t, lang } = useI18n();
  const locale = lang === "ar" ? "ar" : "en-US";

  const details: [typeof Mail, string, string | null][] = [
    [Mail, t("fields.email"), a.email],
    [Phone, t("fields.phone"), a.phone],
    [Building2, t("fields.company"), a.company],
    [MapPin, t("fields.location"), a.location],
  ];

  return (
    <motion.div {...riseOnMount} className="surface rounded-3xl p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-heading font-semibold mb-1">{t("detail.assessment")} #{a.id}</h1>
        <p className="text-label text-muted-foreground">{t("detail.requested", { date: fmt(a.createdAt, locale) })}</p>
      </div>

      <div className="mb-8">
        <Timeline a={a} />
      </div>

      {a.scheduledAt && a.status !== "cancelled" && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#a855f7]/10 border border-[#a855f7]/20 mb-8">
          <Calendar className="w-5 h-5 text-[#c084fc] shrink-0" />
          <div>
            <div className="text-label uppercase tracking-wider text-muted-foreground">{t("detail.scheduledVisit")}</div>
            <div className="text-body font-normal">{fmt(a.scheduledAt, locale, true)}</div>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {a.landSize && (
          <div>
            <div className="text-label uppercase tracking-wider text-muted-foreground mb-1">{t("fields.landSize")}</div>
            <div className="text-body">{a.landSize} ha</div>
          </div>
        )}
        {details.filter(([, , v]) => v).map(([Icon, label, value]) => (
          <div key={label}>
            <div className="text-label uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
            <div className="text-body flex items-center gap-2 break-all"><Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> {value}</div>
          </div>
        ))}
      </div>

      {a.message && (
        <div>
          <div className="text-label uppercase tracking-wider text-muted-foreground mb-1">{t("fields.message")}</div>
          <p className="text-body text-muted-foreground bg-black/20 rounded-xl p-3">{a.message}</p>
        </div>
      )}
    </motion.div>
  );
}

export default function AssessmentDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const id = Number(params.id);
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const enabled = Number.isInteger(id);
  /*
    `isLoadingError`, not `isError` — see the note on QueryState's prop. This detail key
    is `["/api/assessments", id]`, which the booking mutation's invalidation of
    `["/api/assessments"]` prefix-matches; <BookDemoModal /> is mounted globally and the
    bottom nav opens it from this very route. So a user can book from here, have the
    refetch fail on field connectivity, and — under `isError` — watch their perfectly
    good booking turn into "Assessment not found". `isLoadingError` is error AND no
    cached data, the only moment there is genuinely nothing to show.
  */
  const { data: a, isLoading, isLoadingError, refetch } = useAssessment(enabled ? id : undefined);
  const { t } = useI18n();
  useSeo({ title: "Assessment", noindex: true });

  useEffect(() => {
    if (!userLoading && !user) setLocation("/auth");
  }, [userLoading, user, setLocation]);

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-28 pb-28 md:pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-body text-muted-foreground hover:text-foreground mb-6 transition-colors min-h-[44px]">
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("detail.backToDashboard")}
        </Link>

        {/*
          The same four-state contract the lists use. "Empty" here means the query
          settled with nothing — a non-numeric :id, so the query never ran — which is
          the only remaining case that is really "not found"; a fetch that failed is an
          error with a retry, not a missing booking.
        */}
        <QueryState
          isLoading={isLoading}
          isLoadingError={isLoadingError}
          isEmpty={!a}
          onRetry={() => refetch()}
          loadingLabel={t("state.loading")}
          errorTitle={t("state.errorTitle")}
          errorBody={t("state.errorBody")}
          retryLabel={t("state.retry")}
          emptyTitle={t("detail.notFound")}
          emptyBody={t("detail.notFoundBody")}
          // No `emptyAction`: the way out of this screen is the back link directly
          // above the card, already a 44px target. A second button repeating the same
          // label 40px below it reads as a rendering bug, not as an affordance.
        >
          {a && <AssessmentCard a={a} />}
        </QueryState>
      </div>
    </div>
  );
}
