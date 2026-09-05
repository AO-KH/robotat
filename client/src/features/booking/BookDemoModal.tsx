import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Loader2, Mail, ArrowLeft, User as UserIcon, Building2, LogIn, CheckCircle2 } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useDemoModal } from "@/features/booking/DemoModalContext";
import { useCurrentUser } from "@/features/auth/use-auth";
import { useBookAssessment } from "@/features/booking/use-assessments";
import { useI18n } from "@/i18n";
import { track } from "@/lib/analytics";
import { bookAssessmentSchema, type BookAssessmentInput } from "@shared/schema";

type View = "choose" | "form" | "sent";
type AccountType = "individual" | "company";
/** Where the finished booking gets handed off to. */
type Channel = "whatsapp" | "email";

export function BookDemoModal() {
  const { isOpen, source, closeModal, restoreTriggerFocus } = useDemoModal();
  const { data: user, isPending: sessionPending } = useCurrentUser();
  const { t, lang } = useI18n();
  const { mutateAsync: recordBooking } = useBookAssessment();

  const [view, setView] = useState<View>("choose");
  const [type, setType] = useState<AccountType>("individual");
  const [channel, setChannel] = useState<Channel>("email");

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
      setChannel("email");
      reset({ name: user?.name ?? "", email: user?.email ?? "" });
    }
  }, [isOpen, user, reset]);

  // Funnel: one "opened" event per time the modal is shown, tagged with the control that
  // opened it. `source` is set in the same click handler as `isOpen`, so React has
  // committed both by the time this runs; it stays out of the dependency array so that a
  // source change alone could never fire a second open event.
  useEffect(() => {
    if (isOpen) track("booking_open", undefined, source ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /*
    A modal must not outlive the route it was opened on.

    This component is mounted outside the Router, so a client-side navigation while it
    is open leaves it sitting over the new page. Radix keeps `pointer-events: none` on
    <body> for as long as it is open, so the page underneath renders but cannot be
    clicked at all — it looks like the site has frozen.

    Closing here rather than from each link's onClick because there is more than one
    way out: the support link below, the sign-in link, and anything added later. The
    nav menu already does exactly this with `[location]`.

    Safe on mount and on open: `isOpen` is false at mount, and opening the modal does
    not change the location, so this only ever fires on a real navigation.
  */
  const [location] = useLocation();
  useEffect(() => {
    if (isOpen) closeModal();
    // closeModal is recreated on every provider render; depending on it would close
    // the modal on unrelated re-renders. The location is the only trigger wanted here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  /** Pick a channel and go to the form. Nothing is sent or recorded until it is submitted. */
  const chooseChannel = (next: Channel) => {
    track(next === "whatsapp" ? "booking_whatsapp" : "booking_email");
    setChannel(next);
    setView("form");
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
      const res = await recordBooking(payload);
      track("booking_submitted");
      if (channel === "whatsapp") {
        /*
          The WhatsApp link comes back from the server, built from the row it just wrote,
          so the draft carries the same farm details as the email rather than the name
          and address this modal happens to know.

          Same-tab navigation, and that is a correction rather than a preference. This
          first used window.open(_blank) with a `null` check falling back to a
          navigation — but a browser that refuses the popup does not reliably return
          null. Measured here: open() handed back a live-looking object, no tab appeared,
          the page never moved, so the fallback never ran and the booking silently saved
          and went nowhere. There is no dependable way to ask whether a popup actually
          opened, and location.href cannot be popup-blocked at all.

          On a phone — the case that matters, since this ships as an iOS app — the OS
          catches the wa.me link and hands off to WhatsApp, leaving this page loaded
          behind it. On desktop it means web.whatsapp.com in this tab.
        */
        window.location.href = res.whatsappUrl;
        setTimeout(closeModal, 300);
      } else {
        /*
          No mailto handoff. The server has already delivered this booking — business
          notice and customer confirmation both — so opening the Mail app on top of that
          only re-asked the customer to send a message that was already sent, and on a
          phone with no configured mail account it dead-ended in an OS password prompt.
          The in-modal receipt is the whole email experience now.
        */
        setView("sent");
      }
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
                      aria-label={t("booking.back")}
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
                {sessionPending ? (
                  /*
                    `undefined` from useCurrentUser is three states, not one: signed out,
                    still loading, and failed. Branching on `!user` collapsed all three
                    into the gate, so a signed-in customer was told to sign in for as long
                    as /api/auth/me was in flight — and permanently if it errored.

                    Split them. Pending gets a spinner. Only `null`, which the query
                    returns for an explicit 401, means signed out. Anything else — an
                    error, a network blip — falls through to the form, because the client
                    gate is a courtesy and requireAuth on the server is the real one: a
                    signed-out visitor who gets this far is refused there, where being
                    wrong is safe. Blocking someone who is actually signed in is not.
                  */
                  <div className="p-10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : user === null ? (
                  /*
                    Signed-out visitors do not book. A booking creates a tracked row on an
                    account and its confirmations go to that account's verified address,
                    so the account is the first step of the funnel — not an afterthought
                    offered in small print under the channel cards. The gate sits where
                    those cards would be, before anyone has invested in the form.
                  */
                  <div className="p-6 text-center">
                    <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-4">
                      <LogIn className="w-6 h-6 text-[#c084fc] rtl:-scale-x-100" />
                    </div>
                    <h3 className="text-body font-semibold">{t("booking.signInGateTitle")}</h3>
                    <p className="text-label text-muted-foreground mt-2 mb-6">{t("booking.signInGateBody")}</p>
                    {/* A Link, not an <a>: inside the iOS app a real navigation re-boots
                        the whole React app. The route-change effect above closes the modal. */}
                    <Link
                      href="/auth"
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full text-body font-semibold bg-primary text-primary-foreground hover:bg-[#a855f7] transition-colors"
                    >
                      {t("booking.signInGateCta")}
                    </Link>
                    <p className="text-center text-label text-muted-foreground mt-4">
                      {t("booking.needHelp")}{" "}
                      <Link
                        href="/support"
                        className="text-[#c084fc] hover:underline min-h-[44px] px-2 inline-flex items-center"
                      >
                        {t("support.title")}
                      </Link>
                    </p>
                  </div>
                ) : view === "choose" ? (
                  <div className="p-6">
                    <div className="text-center mb-6">
                      <h3 className="text-body font-semibold">{t("booking.howReach")}</h3>
                      <p className="text-label text-muted-foreground mt-1">{t("booking.howReachSub")}</p>
                    </div>

                    {/*
                      Both are plain buttons that only switch view — neither sends
                      anything, so there is nothing to fetch here and no loading state.
                      The links themselves come back from the submit response, built from
                      the saved row, which is what lets the WhatsApp draft carry the farm
                      details instead of just a name and email.
                    */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => chooseChannel("whatsapp")}
                        className="flex flex-col items-center gap-2 py-6 px-3 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/20 transition-colors"
                      >
                        <SiWhatsapp className="w-8 h-8 text-[#25D366]" />
                        <span className="text-body font-semibold">{t("booking.whatsapp")}</span>
                        <span className="text-label text-muted-foreground leading-tight">{t("booking.whatsappSub")}</span>
                      </button>
                      <button
                        onClick={() => chooseChannel("email")}
                        className="flex flex-col items-center gap-2 py-6 px-3 rounded-2xl bg-primary/10 border border-primary/30 hover:bg-primary/20 transition-colors"
                      >
                        <Mail className="w-8 h-8 text-[#c084fc]" />
                        <span className="text-body font-semibold">{t("booking.email")}</span>
                        <span className="text-label text-muted-foreground leading-tight">{t("booking.emailSub")}</span>
                      </button>
                    </div>

                    {/*
                      The way out for someone who came here by the wrong door.

                      The bottom tab bar's "Contact" button opens this modal, and the two
                      cards above are the same channels in the same colours as /support —
                      so a customer who tapped Contact wanting help has just had that
                      expectation confirmed, and the next thing they meet is a form asking
                      for land size and crop type. This is the last point at which they
                      can be redirected before they have invested anything in filling it in.

                      Shown signed in and signed out alike. The reader most likely to need
                      it is the one who cannot get past the sign-in screen, and that reader
                      is signed out.
                    */}
                    <p className="text-center text-label text-muted-foreground mt-3">
                      {t("booking.needHelp")}{" "}
                      {/* A Link, not an <a href> like the sign-in line above: inside the
                          iOS app a real navigation reloads the bundled index.html and
                          re-boots the whole React app, which took ~30s from cold in the
                          Simulator. The modal is closed by the route-change effect above,
                          not from here. */}
                      <Link
                        href="/support"
                        className="text-[#c084fc] hover:underline min-h-[44px] px-2 inline-flex items-center"
                      >
                        {t("support.title")}
                      </Link>
                    </p>
                  </div>
                ) : view === "sent" ? (
                  /* ---- Step 3: the in-app receipt the email channel ends on — see onSubmit ---- */
                  <div className="p-6 text-center">
                    <div className="mx-auto w-14 h-14 rounded-full bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center mb-4">
                      <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                    </div>
                    <h3 className="text-body font-semibold">{t("booking.sentTitle")}</h3>
                    <p className="text-label text-muted-foreground mt-2 mb-6">{t("booking.sentBody")}</p>
                    <button
                      onClick={closeModal}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full text-body font-semibold bg-primary text-primary-foreground hover:bg-[#a855f7] transition-colors"
                    >
                      {t("booking.done")}
                    </button>
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
                        <input {...register("name")} className={inputClass} placeholder={t("placeholder.fullName")} />
                        {errors.name && <p className="text-label text-destructive">{errors.name.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <label className="text-body font-semibold text-foreground/80">{t("booking.phone")}</label>
                        <input {...register("phone")} className={inputClass} placeholder="+966…" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-body font-semibold text-foreground/80">{t("booking.emailLabel")}</label>
                      <input {...register("email")} type="email" className={inputClass} placeholder={t("placeholder.email")} />
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
                        <input {...register("landSize")} className={inputClass} placeholder={t("placeholder.landSize")} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-body font-semibold text-foreground/80">{t("booking.location")}</label>
                        <input {...register("location")} className={inputClass} placeholder={t("placeholder.mapsLink")} />
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
                      /*
                        Green for WhatsApp. The button is the last thing seen before the
                        handoff, so it names and colours the destination rather than
                        leaving someone to guess which of the two they picked a screen ago.
                      */
                      className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full text-body font-semibold transition-colors disabled:opacity-70 disabled:cursor-not-allowed ${
                        channel === "whatsapp"
                          ? "bg-[#25D366] text-black hover:bg-[#1eb85a]"
                          : "bg-primary text-primary-foreground hover:bg-[#a855f7]"
                      }`}
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : channel === "whatsapp" ? (
                        <><SiWhatsapp className="w-4 h-4" /> {t("booking.sendByWhatsapp")}</>
                      ) : (
                        <><Mail className="w-4 h-4" /> {t("booking.sendByEmail")}</>
                      )}
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
