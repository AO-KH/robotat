import { useState } from "react";
import { Link, useSearch } from "wouter";
import { motion } from "framer-motion";
import { Lock, ArrowRight, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useResetPassword } from "@/features/auth/use-auth";
import { useI18n } from "@/i18n";
import { useSeo } from "@/lib/seo";

const iconClass = "absolute left-4 rtl:left-auto rtl:right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground";
const inputClass =
  "w-full pl-12 pr-4 rtl:pl-4 rtl:pr-12 py-3 rounded-xl bg-black/40 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all";

// Only the new password is entered here; the token comes from the URL.
const formSchema = z.object({ newPassword: z.string().min(8, "Password must be at least 8 characters") });
type FormValues = z.infer<typeof formSchema>;

export default function ResetPassword() {
  const { t } = useI18n();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";
  const reset = useResetPassword();
  const [done, setDone] = useState(false);
  useSeo({ title: "Choose a new password", noindex: true });

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const onSubmit = (data: FormValues) =>
    reset.mutate({ token, newPassword: data.newPassword }, { onSuccess: () => setDone(true) });

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-24 pb-28 md:py-12 hero-gradient">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-card rounded-3xl p-8 border border-white/10 shadow-2xl"
      >
        {!token ? (
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">{t("recover.badLink")}</h1>
            <Link href="/forgot-password" className="text-sm text-[#c084fc] hover:underline">
              {t("recover.requestNewLink")}
            </Link>
          </div>
        ) : done ? (
          <div className="text-center">
            <CheckCircle2 className="w-12 h-12 text-[#5eead4] mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">{t("recover.resetDone")}</h1>
            <p className="text-muted-foreground mb-6">{t("recover.resetDoneSub")}</p>
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium hover:bg-[#a855f7] transition-colors"
            >
              {t("recover.goToSignIn")} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">{t("recover.resetTitle")}</h1>
              <p className="text-muted-foreground">{t("recover.resetSub")}</p>
            </div>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">{t("recover.newPassword")}</label>
                <div className="relative">
                  <Lock className={iconClass} />
                  <input
                    type="password"
                    placeholder={t("auth.passwordHint")}
                    className={inputClass}
                    {...form.register("newPassword")}
                  />
                </div>
                {form.formState.errors.newPassword && (
                  <p className="text-xs text-destructive">{form.formState.errors.newPassword.message}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={reset.isPending}
                className="w-full py-4 rounded-full bg-primary text-primary-foreground font-medium hover:bg-[#a855f7] transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {reset.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>{t("recover.updatePassword")} <ArrowRight className="w-5 h-5 rtl:rotate-180" /></>
                )}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
