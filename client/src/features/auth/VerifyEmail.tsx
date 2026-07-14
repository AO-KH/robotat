import { useEffect, useRef } from "react";
import { Link, useSearch } from "wouter";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { useVerifyEmail } from "@/features/auth/use-auth";
import { useI18n } from "@/i18n";
import { useSeo } from "@/lib/seo";

export default function VerifyEmail() {
  const { t } = useI18n();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";
  const verify = useVerifyEmail();
  const started = useRef(false);
  useSeo({ title: "Verify your email", noindex: true });

  // Redeem the token once, automatically, on mount.
  useEffect(() => {
    if (started.current || !token) return;
    started.current = true;
    verify.mutate(token);
  }, [token, verify]);

  const failed = !token || verify.isError;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-24 pb-28 md:py-12 hero-gradient">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-card rounded-3xl p-8 border border-white/10 shadow-2xl text-center"
      >
        {verify.isSuccess ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-[#5eead4] mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">{t("recover.verifiedTitle")}</h1>
            <p className="text-muted-foreground mb-6">{t("recover.verifiedSub")}</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium hover:bg-[#a855f7] transition-colors"
            >
              {t("recover.continueToDashboard")} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </Link>
          </>
        ) : failed ? (
          <>
            <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">{t("recover.verifyFailedTitle")}</h1>
            <p className="text-muted-foreground mb-6">
              {token ? t("recover.verifyFailedSub") : t("recover.missingToken")}
            </p>
            <Link href="/dashboard" className="text-sm text-[#c084fc] hover:underline">
              {t("recover.continueToDashboard")}
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-spin" />
            <h1 className="text-2xl font-bold">{t("recover.verifyingTitle")}</h1>
          </>
        )}
      </motion.div>
    </div>
  );
}
