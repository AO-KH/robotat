import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Mail, ArrowLeft, User as UserIcon, Building2 } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useDemoModal } from "@/features/booking/DemoModalContext";
import { useCurrentUser } from "@/features/auth/use-auth";
import { useContactLinks, useContactSubmit, useBookAssessment } from "@/features/booking/use-assessments";
import { bookAssessmentSchema, type BookAssessmentInput } from "@shared/schema";

type View = "choose" | "form";
type AccountType = "individual" | "company";

export function BookDemoModal() {
  const { isOpen, closeModal } = useDemoModal();
  const { data: user } = useCurrentUser();
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

  // Reset to the channel chooser each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setView("choose");
      setType("individual");
      recordedRef.current = false;
      reset({ name: user?.name ?? "", email: user?.email ?? "" });
    }
  }, [isOpen, user, reset]);

  // WhatsApp — quick chat: log once for signed-in users, then let the link open.
  const handleWhatsapp = () => {
    if (user && !recordedRef.current) {
      recordedRef.current = true;
      recordBooking({ name: user.name, email: user.email }).catch(() => {});
    }
    setTimeout(closeModal, 400);
  };

  // Email — submit the detail form, then open the user's mail client pre-filled.
  const onSubmit = async (data: BookAssessmentInput) => {
    if (type === "company" && !data.company?.trim()) {
      setError("company", { message: "Company name is required" });
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
                      className="p-1.5 -ml-1.5 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                  )}
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Book a site assessment</h2>
                    <p className="text-sm text-muted-foreground mt-1">A ROBOTAT agronomist visits your farm.</p>
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
                      <h3 className="text-lg font-semibold">How would you like to reach us?</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Chat with us now, or send the full details by email.
                      </p>
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
                          <span className="text-sm font-semibold">WhatsApp</span>
                          <span className="text-[11px] text-muted-foreground leading-tight">Chat with us now</span>
                        </a>
                        <button
                          onClick={() => setView("form")}
                          className="flex flex-col items-center gap-2 py-6 px-3 rounded-2xl bg-primary/10 border border-primary/30 hover:bg-primary/20 transition-colors"
                        >
                          <Mail className="w-8 h-8 text-[#c084fc]" />
                          <span className="text-sm font-semibold">Email</span>
                          <span className="text-[11px] text-muted-foreground leading-tight">Fill in the details</span>
                        </button>
                      </div>
                    )}

                    {!user && (
                      <p className="text-center text-xs text-muted-foreground mt-5">
                        Have an account?{" "}
                        <a href="/auth" className="text-[#c084fc] hover:underline">Sign in</a>{" "}
                        to track your requests.
                      </p>
                    )}
                  </div>
                ) : (
                  /* ---- Step 2: email detail form ---- */
                  <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
                    {/* Individual / Company toggle */}
                    <div className="grid grid-cols-2 gap-2 p-1 rounded-full bg-black/40 border border-white/10">
                      {([
                        { key: "individual", label: "Individual", icon: UserIcon },
                        { key: "company", label: "Company", icon: Building2 },
                      ] as const).map((opt) => (
                        <button
                          type="button"
                          key={opt.key}
                          onClick={() => setType(opt.key)}
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
                          {type === "company" ? "Contact name *" : "Full name *"}
                        </label>
                        <input {...register("name")} className={inputClass} placeholder="John Doe" />
                        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Phone</label>
                        <input {...register("phone")} className={inputClass} placeholder="+966…" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/80">Email *</label>
                      <input {...register("email")} type="email" className={inputClass} placeholder="you@example.com" />
                      {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                    </div>

                    {type === "company" && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Company name *</label>
                        <input {...register("company")} className={inputClass} placeholder="Company name" />
                        {errors.company && <p className="text-xs text-destructive">{errors.company.message}</p>}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Land size (ha)</label>
                        <input {...register("landSize")} className={inputClass} placeholder="e.g. 50" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground/80">Location / Maps link</label>
                        <input {...register("location")} className={inputClass} placeholder="https://goo.gl/…" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground/80">Message</label>
                      <textarea
                        {...register("message")}
                        rows={3}
                        className={`${inputClass} resize-none`}
                        placeholder="Tell us about your crop and what you need…"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-[#a855f7] transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Mail className="w-4 h-4" /> Send by email</>}
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
