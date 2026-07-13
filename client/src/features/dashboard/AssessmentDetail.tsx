import { useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Mail, Phone, Building2, MapPin, Calendar, Check, X, Clock } from "lucide-react";
import type { Assessment } from "@shared/schema";
import { useCurrentUser } from "@/features/auth/use-auth";
import { useAssessment } from "@/features/booking/use-assessments";
import { useSeo } from "@/lib/seo";

const STEPS = [
  { key: "pending", label: "Requested", icon: Clock },
  { key: "scheduled", label: "Scheduled", icon: Calendar },
  { key: "completed", label: "Completed", icon: Check },
] as const;

function fmt(v: string | Date | null, withTime = false): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

function Timeline({ a }: { a: Assessment }) {
  if (a.status === "cancelled") {
    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
        <X className="w-5 h-5 shrink-0" />
        <span className="font-medium">This assessment was cancelled.</span>
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
              <span className={`text-xs font-medium ${done || current ? "text-foreground" : "text-muted-foreground"}`}>
                {step.label}
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

export default function AssessmentDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const id = Number(params.id);
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: a, isLoading, isError } = useAssessment(Number.isInteger(id) ? id : undefined);
  useSeo({ title: "Assessment", noindex: true });

  useEffect(() => {
    if (!userLoading && !user) setLocation("/auth");
  }, [userLoading, user, setLocation]);

  if (userLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !a) {
    return (
      <div className="min-h-screen pt-28 px-4 text-center">
        <p className="text-lg font-medium mb-2">Assessment not found</p>
        <Link href="/dashboard" className="text-[#c084fc] hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  const details: [typeof Mail, string, string | null][] = [
    [Mail, "Email", a.email],
    [Phone, "Phone", a.phone],
    [Building2, "Company", a.company],
    [MapPin, "Location", a.location],
  ];

  return (
    <div className="min-h-screen pt-28 pb-28 md:pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-3xl border border-white/10 p-6 md:p-8">
          <div className="mb-8">
            <h1 className="text-2xl md:text-3xl font-bold mb-1">Assessment #{a.id}</h1>
            <p className="text-sm text-muted-foreground">Requested {fmt(a.createdAt)}</p>
          </div>

          <div className="mb-8">
            <Timeline a={a} />
          </div>

          {a.scheduledAt && a.status !== "cancelled" && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#a855f7]/10 border border-[#a855f7]/20 mb-8">
              <Calendar className="w-5 h-5 text-[#c084fc] shrink-0" />
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Scheduled visit</div>
                <div className="font-medium">{fmt(a.scheduledAt, true)}</div>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            {a.landSize && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Land size</div>
                <div className="text-sm">{a.landSize} ha</div>
              </div>
            )}
            {details.filter(([, , v]) => v).map(([Icon, label, value]) => (
              <div key={label}>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
                <div className="text-sm flex items-center gap-2 break-all"><Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> {value}</div>
              </div>
            ))}
          </div>

          {a.message && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Message</div>
              <p className="text-sm text-muted-foreground bg-black/20 rounded-xl p-3">{a.message}</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
