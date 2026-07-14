import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Mail, ArrowRight, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@shared/schema";
import { useForgotPassword } from "@/features/auth/use-auth";
import { useI18n } from "@/i18n";
import { useSeo } from "@/lib/seo";

const iconClass = "absolute left-4 rtl:left-auto rtl:right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground";
const inputClass =
  "w-full pl-12 pr-4 rtl:pl-4 rtl:pr-12 py-3 rounded-xl bg-black/40 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all";

export default function ForgotPassword() {
  const { t } = useI18n();
  const forgot = useForgotPassword();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | undefined>();
  useSeo({ title: "Reset your password", noindex: true });

  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = (data: ForgotPasswordInput) =>
    forgot.mutate(data, {
      onSuccess: (res) => {
        setDevToken(res.devToken);
        setSentTo(data.email);
      },
    });

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-24 pb-28 md:py-12 hero-gradient">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-card rounded-3xl p-8 border border-white/10 shadow-2xl"
      >
        {sentTo ? (
          <div className="text-center">
            <CheckCircle2 className="w-12 h-12 text-[#5eead4] mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">{t("recover.checkInbox")}</h1>
            <p className="text-muted-foreground mb-6">{t("recover.checkInboxSub", { email: sentTo })}</p>
            {devToken && (
              <Link
                href={`/reset-password?token=${devToken}`}
                className="block mb-6 text-xs text-[#c084fc] underline break-all"
              >
                dev: /reset-password?token={devToken}
              </Link>
            )}
            <Link href="/auth" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("recover.backToSignIn")}
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">{t("recover.forgotTitle")}</h1>
              <p className="text-muted-foreground">{t("recover.forgotSub")}</p>
            </div>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">{t("auth.email")}</label>
                <div className="relative">
                  <Mail className={iconClass} />
                  <input type="email" placeholder="you@company.com" className={inputClass} {...form.register("email")} />
                </div>
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={forgot.isPending}
                className="w-full py-4 rounded-full bg-primary text-primary-foreground font-medium hover:bg-[#a855f7] transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {forgot.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>{t("recover.sendLink")} <ArrowRight className="w-5 h-5 rtl:rotate-180" /></>
                )}
              </button>
            </form>
            <div className="mt-8 text-center text-sm">
              <Link href="/auth" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
                <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("recover.backToSignIn")}
              </Link>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
