import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Loader2, Mail, ArrowLeft, User as UserIcon, Building2 } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useDemoModal } from "@/features/booking/DemoModalContext";
import { useCurrentUser } from "@/features/auth/use-auth";
import { useContactLinks, useContactSubmit, useBookAssessment } from "@/features/booking/use-assessments";
import { useI18n } from "@/i18n";
import { track } from "@/lib/analytics";
import { bookAssessmentSchema, type BookAssessmentInput } from "@shared/schema";

type View = "choose" | "form";
type AccountType = "individual" | "company";

export function BookDemoModal() {
  const { isOpen, closeModal, restoreTriggerFocus } = useDemoModal();
  const { data: user } = useCurrentUser();
  const { t, lang } = useI18n();
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

  // Funnel: one "opened" event per time the modal is shown.
  useEffect(() => {
    if (isOpen) track("booking_open");
  }, [isOpen]);

  const handleWhatsapp = () => {
    track("booking_whatsapp");
    if (user && !recordedRef.current) {
      recordedRef.current = true;
      recordBooking({ name: user.name, email: user.email, locale: lang }).catch(() => {});
    }
    setTimeout(closeModal, 400);
  };

  const onSubmit = async (data: BookAssessmentInput) => {
    if (type === "company" && !data.company?.trim()) {
      setError("company", { message: t("booking.companyRequired") });
      return;
    }
    // The language they are looking at is the language their confirmation and every
    // later status update arrives in.
    const withLocale = { ...data, locale: lang };
    const payload = type === "individual" ? { ...withLocale, company: "" } : withLocale;
    try {
      const res = user ? await recordBooking(payload) : await submitContact(payload);
      track("booking_submitted");
      window.location.href = res.mailtoUrl;
      setTimeout(closeModal, 300);
    } catch {
      /* mutation hooks surface the toast */
    }
  };

  const inputClass =
    "w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all";

  /*
    Radix, not a hand-rolled trap. This was a bare <div>: no role, no aria-modal, no
    focus trap, no Escape, no focus restore — so VoiceOver could wander into the page
    behind it and Tab could leave it entirely. Radix's Dialog brings all of that plus
    the parts a hand-rolled trap reliably gets wrong: focus guards either side of the
    portal, aria-hidden on the rest of the document, and scroll lock. A focus trap done
    badly is worse than none, so writing one here was not the cheaper option.

    The primitives directly rather than components/ui/dialog.tsx's `DialogContent`:
    that wrapper hard-codes its own centring, padding, `bg-background` and a second
    close button, none of which this modal wants — adopting it would have meant
    overriding nearly every class and hiding its close button. `Root`/`Portal`/
    `Content`/`Title`/`Description` are the same Radix components that file is built
    from, just without styling opinions this modal has to undo.

    `forceMount` on both Portal and Content is what keeps the existing animation:
    without it Radix's own Presence unmounts the panel the instant `open` flips false
    and the framer exit never runs. With it, AnimatePresence stays in charge and the
    scale/y transition is untouched. Radix Dialog has no directional layout of its own
    (unlike Select or DropdownMenu, which take a `dir`), so the `rtl:` utilities in
    here keep working exactly as before.
  */
  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeModal();
      }}
    >
      <DialogPrimitive.Portal forceMount>
        {/*
          This plain <div> is load-bearing, not stray markup. Radix's Portal renders
          `<PortalPrimitive asChild={true}>` around each child — asChild is hardcoded in
          its source, not a prop — so it always goes through Slot and always tries to
          attach a ref to whatever it is given. `AnimatePresence` is a plain function
          component with no forwardRef, so React warned "Function components cannot be
          given refs" and the ref silently never landed. A DOM element takes it.

          It has no layout effect: everything inside is `fixed`, so an unstyled block
          element in the portal root changes nothing.
        */}
        <div>
          <AnimatePresence>
          {isOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }} // overlay-ok
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeModal}
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
              />
              <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
                <DialogPrimitive.Content
                  forceMount
                  asChild
                  /*
                    Radix returns focus to its own `Dialog.Trigger`, and this modal has
                    none — it opens through context from the hero, the nav and the bottom
                    tab bar. Left alone, closing it dropped focus on <body>, so a keyboard
                    user landed at the top of the document. Verified in the browser before
                    and after: activeElement went from BODY to the button that opened it.
                  */
                  onCloseAutoFocus={(event) => {
                    if (restoreTriggerFocus()) event.preventDefault();
                  }}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }} // overlay-ok
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
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
                    </button>
                  )}
                  <div>
                    {/*
                      asChild so Radix wires aria-labelledby/aria-describedby to these
                      exact nodes — the dialog is labelled by its own visible title
                      rather than by a duplicated aria-label that can drift from it.
                    */}
                    <DialogPrimitive.Title asChild>
                      <h2 className="text-subhead font-semibold text-foreground">{t("booking.title")}</h2>
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description asChild>
                      <p className="text-label text-muted-foreground mt-1">{t("booking.subtitle")}</p>
                    </DialogPrimitive.Description>
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  aria-label={t("booking.close")}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto">
                {/* ---- Step 1: choose a channel ---- */}
                {view === "choose" ? (
                  <div className="p-6">
                    <div className="text-center mb-6">
                      <h3 className="text-body font-semibold">{t("booking.howReach")}</h3>
                      <p className="text-label text-muted-foreground mt-1">{t("booking.howReachSub")}</p>
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
                          <span className="text-body font-semibold">{t("booking.whatsapp")}</span>
                          <span className="text-label text-muted-foreground leading-tight">{t("booking.whatsappSub")}</span>
                        </a>
                        <button
                          onClick={() => {
                            track("booking_email");
                            setView("form");
                          }}
                          className="flex flex-col items-center gap-2 py-6 px-3 rounded-2xl bg-primary/10 border border-primary/30 hover:bg-primary/20 transition-colors"
                        >
                          <Mail className="w-8 h-8 text-[#c084fc]" />
                          <span className="text-body font-semibold">{t("booking.email")}</span>
                          <span className="text-label text-muted-foreground leading-tight">{t("booking.emailSub")}</span>
                        </button>
                      </div>
                    )}

                    {!user && (
                      <p className="text-center text-label text-muted-foreground mt-5">
                        {t("booking.haveAccount")}{" "}
                        <a
                          href="/auth"
                          className="text-[#c084fc] hover:underline min-h-[44px] px-2 inline-flex items-center"
                        >
                          {t("auth.signIn")}
                        </a>{" "}
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
                          className={`flex items-center justify-center gap-2 py-2.5 rounded-full text-body font-semibold transition-colors ${
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
                        <label className="text-body font-semibold text-foreground/80">
                          {type === "company" ? t("booking.contactName") : t("booking.fullName")}
                        </label>
                        <input {...register("name")} className={inputClass} placeholder="John Doe" />
                        {errors.name && <p className="text-label text-destructive">{errors.name.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <label className="text-body font-semibold text-foreground/80">{t("booking.phone")}</label>
                        <input {...register("phone")} className={inputClass} placeholder="+966…" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-body font-semibold text-foreground/80">{t("booking.emailLabel")}</label>
                      <input {...register("email")} type="email" className={inputClass} placeholder="you@example.com" />
                      {errors.email && <p className="text-label text-destructive">{errors.email.message}</p>}
                    </div>

                    {type === "company" && (
                      <div className="space-y-2">
                        <label className="text-body font-semibold text-foreground/80">{t("booking.companyName")}</label>
                        <input {...register("company")} className={inputClass} placeholder={t("booking.companyNamePlaceholder")} />
                        {errors.company && <p className="text-label text-destructive">{errors.company.message}</p>}
                      </div>
                    )}

                    {/*
                      `items-end` because these two labels do not wrap in step: at 375px in
                      English "Location / Maps link" needs two lines in the 139px column while
                      "Land size (ha)" needs one. Each cell stacks independently, so without
                      this the two inputs sit 26px apart. Aligning the row on its end edge puts
                      the inputs on one baseline whatever the labels above them do.
                    */}
                    <div className="grid grid-cols-2 gap-4 items-end">
                      <div className="space-y-2">
                        <label className="text-body font-semibold text-foreground/80">{t("booking.landSize")}</label>
                        <input {...register("landSize")} className={inputClass} placeholder="e.g. 50" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-body font-semibold text-foreground/80">{t("booking.location")}</label>
                        <input {...register("location")} className={inputClass} placeholder="https://goo.gl/…" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-body font-semibold text-foreground/80">{t("booking.message")}</label>
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
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-primary text-primary-foreground text-body font-semibold hover:bg-[#a855f7] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Mail className="w-4 h-4" /> {t("booking.sendByEmail")}</>}
                    </button>
                  </form>
                )}
              </div>
                  </motion.div>
                </DialogPrimitive.Content>
              </div>
            </>
          )}
          </AnimatePresence>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
