import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Mail, ArrowLeft, User as UserIcon, Building2 } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useDemoModal } from "@/features/booking/DemoModalContext";
import { useCurrentUser } from "@/features/auth/use-auth";
import { useContactLinks, useContactSubmit, useBookAssessment } from "@/features/booking/use-assessments";
import { useI18n } from "@/i18n";
import { bookAssessmentSchema, type BookAssessmentInput } from "@shared/schema";

type View = "choose" | "form";
type AccountType = "individual" | "company";

export function BookDemoModal() {
  const { isOpen, closeModal } = useDemoModal();
  const { data: user } = useCurrentUser();
  const { t } = useI18n();
  const { data: links, isLoading } = useContactLinks(isOpen);
  const { mutateAsync: recordBooking } = useBookAssessment();
  const { mutateAsync: submitContact } = useContactSubmit();

  const [view, setView] = useState<View>("choose");
  const [type, setType] = useState<AccountType>("individual");
  const recordedRef = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BookAssessmentInput>({ resolver: zodResolver(bookAssessmentSchema) });

  useEffect(() => {
    if (isOpen) {
      setView("choose");
      setType("individual");
      recordedRef.current = false;
      reset({ name: user?.name ?? "", email: user?.email ?? "" });
    }
  }, [isOpen, user, reset]);

  const handleWhatsapp = () => {
    if (user && !recordedRef.current) {
      recordedRef.current = true;
      recordBooking({ name: user.name, email: user.email }).catch(() => {});
    }
    setTimeout(closeModal, 400);
  };

  const onSubmit = async (data: BookAssessmentInput) => {
    if (type === "company" && !data.company?.trim()) {
      setError("company", { message: t("booking.companyRequired") });
      return;
    }
    const payload = type === "individual" ? { ...data, company: "" } : data;
    try {
      const res = user ? await recordBooking(payload) : await submitContact(payload);
      window.location.href = res.mailtoUrl;
      setTimeout(closeModal, 300);
    } catch {
      /* mutation hooks surface the toast */
    }
  };

  const inputClass =
    "w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-[#15101f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5 shrink-0">
                <div className="flex items-center gap-3">
                  {view === "form" && (
                    <button
                      onClick={() => setView("choose")}
                      aria-label="Back"
                      className="p-1.5 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
                    </button>
                  )}
                  <div>
                    <h2 className="text-xl font-bold text-foreground">{t("booking.title")}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{t("booking.subtitle")}</p>
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  className="p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto">
                {/* ---- Step 1: choose a channel ---- */}
                {view === "choose" ? (
                  <div className="p-6">
                    <div className="text-center mb-6">
                      <h3 className="text-lg font-semibold">{t("booking.howReach")}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{t("booking.howReachSub")}</p>
                    </div>

                    {isLoading || !links ? (
                      <div className="py-10 flex justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <a
                          href={links.whatsappUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={handleWhatsapp}
                          className="flex flex-col items-center gap-2 py-6 px-3 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/20 transition-colors"
                        >
                          <SiWhatsapp className="w-8 h-8 text-[#25D366]" />
                          <span className="text-sm font-semibold">{t("booking.whatsapp")}</span>
                          <span className="text-[11px] text-muted-foreground leading-tight">{t("booking.whatsappSub")}</span>
                        </a>
                        <button
                          onClick={() => setView("form")}
                          className="flex flex-col items-center gap-2 py-6 px-3 rounded-2xl bg-primary/10 border border-primary/30 hover:bg-primary/20 transition-colors"
                        >
                          <Mail className="w-8 h-8 text-[#c084fc]" />
                          <span className="text-sm font-semibold">{t("booking.email")}</span>
                          <span className="text-[11px] text-muted-foreground leading-tight">{t("booking.emailSub")}</span>
                        </button>
                      </div>
                    )}

                    {!user && (
                      <p className="text-center text-xs text-muted-foreground mt-5">
                        {t("booking.haveAccount")}{" "}
                        <a href="/auth" className="text-[#c084fc] hover:underline">{t("auth.signIn")}</a>{" "}
                        {t("booking.signInToTrack")}
                      </p>
                    )}
                  </div>
                ) : (
                  /* ---- Step 2: email detail form ---- */
                  <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
                    {/* Individual / Company toggle */}
                    <div className="grid grid-cols-2 gap-2 p-1 rounded-full bg-black/40 border border-white/10">
                      {([
                        { key: "individual", label: t("booking.individual"), icon: UserIcon },
                        { key: "company", label: t("booking.company"), icon: Building2 },
                      ] as const).map((opt) => (
                        <button
                          type="button"
                          key={opt.key}
                          onClick={() => setType(opt.key as AccountType)}
                          className={`flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-medium transition-colors ${
                            type === opt.key
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <opt.icon className="w-4 h-4" /> {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">
                          {type === "company" ? t("booking.contactName") : t("booking.fullName")}
                        </label>
                        <input {...register("name")} className={inputClass} placeholder="John Doe" />
                        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">{t("booking.phone")}</label>
                        <input {...register("phone")} className={inputClass} placeholder="+966…" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/80">{t("booking.emailLabel")}</label>
                      <input {...register("email")} type="email" className={inputClass} placeholder="you@example.com" />
                      {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                    </div>

                    {type === "company" && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">{t("booking.companyName")}</label>
                        <input {...register("company")} className={inputClass} placeholder={t("booking.companyNamePlaceholder")} />
                        {errors.company && <p className="text-xs text-destructive">{errors.company.message}</p>}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">{t("booking.landSize")}</label>
                        <input {...register("landSize")} className={inputClass} placeholder="e.g. 50" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">{t("booking.location")}</label>
                        <input {...register("location")} className={inputClass} placeholder="https://goo.gl/…" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/80">{t("booking.message")}</label>
                      <textarea
                        {...register("message")}
                        rows={3}
                        className={`${inputClass} resize-none`}
                        placeholder={t("booking.messagePlaceholder")}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-[#a855f7] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Mail className="w-4 h-4" /> {t("booking.sendByEmail")}</>}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
