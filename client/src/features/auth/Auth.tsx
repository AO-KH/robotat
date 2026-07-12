import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, Lock, Mail, ArrowRight, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, loginSchema, type RegisterInput, type LoginInput } from "@shared/schema";
import { useCurrentUser, useLogin, useRegister } from "@/features/auth/use-auth";
import { useI18n } from "@/i18n";

const iconClass = "absolute left-4 rtl:left-auto rtl:right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground";
const inputClass =
  "w-full pl-12 pr-4 rtl:pl-4 rtl:pr-12 py-3 rounded-xl bg-black/40 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [, setLocation] = useLocation();
  const { data: user } = useCurrentUser();
  const { t } = useI18n();
  const login = useLogin();
  const register = useRegister();

  useEffect(() => {
    if (user) setLocation("/dashboard");
  }, [user, setLocation]);

  const loginForm = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onLogin = (data: LoginInput) => login.mutate(data, { onSuccess: () => setLocation("/dashboard") });
  const onRegister = (data: RegisterInput) => register.mutate(data, { onSuccess: () => setLocation("/dashboard") });

  const pending = login.isPending || register.isPending;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-24 pb-28 md:py-12 hero-gradient">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-card rounded-3xl p-8 border border-white/10 shadow-2xl"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{isLogin ? t("auth.welcomeBack") : t("auth.createAccount")}</h1>
          <p className="text-muted-foreground">{isLogin ? t("auth.signInSub") : t("auth.registerSub")}</p>
        </div>

        {isLogin ? (
          <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-5" noValidate>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">{t("auth.email")}</label>
              <div className="relative">
                <Mail className={iconClass} />
                <input type="email" placeholder="you@company.com" className={inputClass} {...loginForm.register("email")} />
              </div>
              {loginForm.formState.errors.email && (
                <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">{t("auth.password")}</label>
              <div className="relative">
                <Lock className={iconClass} />
                <input type="password" placeholder="••••••••" className={inputClass} {...loginForm.register("password")} />
              </div>
              {loginForm.formState.errors.password && (
                <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={pending}
              className="w-full py-4 rounded-full bg-primary text-primary-foreground font-medium hover:bg-[#a855f7] transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{t("auth.signIn")} <ArrowRight className="w-5 h-5 rtl:rotate-180" /></>}
            </button>
          </form>
        ) : (
          <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-5" noValidate>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">{t("auth.fullName")}</label>
              <div className="relative">
                <User className={iconClass} />
                <input type="text" placeholder="John Doe" className={inputClass} {...registerForm.register("name")} />
              </div>
              {registerForm.formState.errors.name && (
                <p className="text-xs text-destructive">{registerForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">{t("auth.email")}</label>
              <div className="relative">
                <Mail className={iconClass} />
                <input type="email" placeholder="you@company.com" className={inputClass} {...registerForm.register("email")} />
              </div>
              {registerForm.formState.errors.email && (
                <p className="text-xs text-destructive">{registerForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">{t("auth.password")}</label>
              <div className="relative">
                <Lock className={iconClass} />
                <input type="password" placeholder={t("auth.passwordHint")} className={inputClass} {...registerForm.register("password")} />
              </div>
              {registerForm.formState.errors.password && (
                <p className="text-xs text-destructive">{registerForm.formState.errors.password.message}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={pending}
              className="w-full py-4 rounded-full bg-primary text-primary-foreground font-medium hover:bg-[#a855f7] transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{t("auth.createAccountBtn")} <ArrowRight className="w-5 h-5 rtl:rotate-180" /></>}
            </button>
          </form>
        )}

        <div className="mt-8 text-center text-sm">
          <button
            onClick={() => setIsLogin((v) => !v)}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            {isLogin ? t("auth.toSignUp") : t("auth.toSignIn")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
