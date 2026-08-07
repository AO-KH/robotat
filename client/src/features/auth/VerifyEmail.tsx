import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, MailCheck, ArrowRight } from "lucide-react";
import { useCurrentUser, useVerifyEmail, useResendVerification } from "@/features/auth/use-auth";
import { useI18n } from "@/i18n";
import { useSeo } from "@/lib/seo";
import { riseOnMount } from "@/lib/motion";
import { ApiError } from "@/lib/api-error";

/** Digits only, capped at six — the length the server will accept. */
const clean = (raw: string) => raw.replace(/\D/g, "").slice(0, 6);

export default function VerifyEmail() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const verify = useVerifyEmail();
  const resend = useResendVerification();
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  /*
    The submit effect calls through this rather than closing over `verify`, so the
    mutation's changing identity cannot pull it into the dependency array — which is what
    made it fire repeatedly. The ref always holds the current mutate.
  */
  const verifyRef = useRef(verify.mutate);
  verifyRef.current = verify.mutate;
  useSeo({ title: "Confirm your email", noindex: true });

  // Nobody to confirm for. Sending them to sign in beats an input that cannot work.
  useEffect(() => {
    if (!userLoading && !user) setLocation("/auth");
  }, [userLoading, user, setLocation]);

  // The code is the only thing on this screen, so it takes focus.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /*
    Submits itself on the sixth digit. Typing a code and then reaching for a button is
    a step the phone keyboard is already covering up, and the field cannot hold more
    than six digits, so there is nothing else the customer could have meant.

    Keyed on the code that was last sent, not on the mutation's flags. The mutation
    object is a new identity on every render, so listing it as a dependency re-ran this
    effect continuously: one wrong code fired five requests and burned the entire
    attempt allowance before the customer had touched anything. Comparing against the
    submitted value sends each distinct code exactly once, and editing a digit makes it
    a different value, which is precisely when a retry should be allowed.
  */
  const submittedRef = useRef<string | null>(null);
  useEffect(() => {
    if (code.length !== 6 || submittedRef.current === code) return;
    submittedRef.current = code;
    verifyRef.current(code);
  }, [code]);

  const errorText = (() => {
    if (!verify.isError) return null;
    const status = verify.error instanceof ApiError ? verify.error.status : 0;
    if (status === 429) return t("recover.codeExhausted");
    if (status === 400) return t("recover.codeWrong");
    return t("state.errorBody");
  })();

  if (userLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="sr-only">{t("state.loading")}</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-24 pb-28 md:py-12 hero-gradient">
      <motion.div {...riseOnMount} className="w-full max-w-md surface rounded-3xl p-8 shadow-2xl text-center">
        {verify.isSuccess ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-[#5eead4] mx-auto mb-4" />
            <h1 className="text-heading font-semibold mb-2">{t("recover.verifiedTitle")}</h1>
            <p className="text-body text-muted-foreground mb-6">{t("recover.verifiedSub")}</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 rounded-full bg-primary text-primary-foreground text-body font-semibold hover:bg-[#a855f7] transition-colors"
            >
              {t("recover.continueToDashboard")} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </Link>
          </>
        ) : (
          <>
            <MailCheck className="w-12 h-12 text-[#c084fc] mx-auto mb-4" />
            <h1 className="text-heading font-semibold mb-2">{t("recover.enterCodeTitle")}</h1>
            <p className="text-body text-muted-foreground mb-6">
              {t("recover.enterCodeSub", { email: user.email })}
            </p>

            <label className="block">
              <span className="sr-only">{t("recover.codeLabel")}</span>
              <input
                ref={inputRef}
                value={code}
                onChange={(e) => setCode(clean(e.target.value))}
                disabled={verify.isPending}
                /*
                  inputMode numeric brings up the digit pad on a phone; autoComplete
                  "one-time-code" is what lets iOS offer the code from the Mail
                  notification above the keyboard, which is the whole reason this is a
                  code and not a link.
                */
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                aria-invalid={verify.isError}
                aria-describedby={errorText ? "code-error" : undefined}
                placeholder="000000"
                className="w-full text-center font-mono text-heading tracking-[0.4em] px-4 py-4 rounded-2xl bg-black/40 border border-white/10 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-60"
              />
            </label>

            <div className="min-h-[24px] mt-3" aria-live="polite">
              {verify.isPending && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />}
              {errorText && (
                <p id="code-error" className="text-body text-destructive">
                  {errorText}
                </p>
              )}
            </div>

            <button
              onClick={() => {
                setCode("");
                resend.mutate();
                inputRef.current?.focus();
              }}
              disabled={resend.isPending}
              className="mt-4 min-h-[44px] px-4 inline-flex items-center justify-center gap-2 text-body font-semibold text-[#c084fc] hover:underline disabled:opacity-60"
            >
              {resend.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("recover.resendCode")}
            </button>

            <p className="mt-4">
              <Link href="/dashboard" className="text-body text-muted-foreground hover:text-foreground">
                {t("recover.laterLink")}
              </Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
