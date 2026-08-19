import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, User, Home, Tractor, Layers, MessageSquare, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useDemoModal } from "@/features/booking/DemoModalContext";
import { useCurrentUser } from "@/features/auth/use-auth";
import { useI18n, type Lang } from "@/i18n";

import logo from "@assets/Robtat_by_Nasl_Logo-02_1771961617038.png";

function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={`inline-flex items-center rounded-full border border-white/10 bg-white/5 p-0.5 ${className}`}>
      {(["en", "ar"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`min-h-[44px] min-w-[44px] px-2.5 flex items-center justify-center rounded-full text-label font-normal transition-colors ${
            lang === l ? "bg-primary/20 text-[#c084fc]" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t(`lang.${l}`)}
        </button>
      ))}
    </div>
  );
}

export function Navigation() {
  const [location] = useLocation();
  const { openModal } = useDemoModal();
  const { data: user } = useCurrentUser();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  const isStaff = user?.role === "staff";

  const desktopLinks = [
    { href: "/", label: t("nav.home") },
    { href: "/fleet", label: t("nav.products") },
    { href: "/services", label: t("nav.services") },
    ...(isStaff ? [{ href: "/admin", label: t("nav.admin") }] : []),
  ];

  const menuLinks = [
    { href: "/", label: t("nav.home") },
    { href: "/fleet", label: t("nav.products") },
    { href: "/services", label: t("nav.services") },
    ...(isStaff ? [{ href: "/admin", label: t("nav.admin") }] : []),
    user ? { href: "/dashboard", label: t("nav.myDashboard") } : { href: "/auth", label: t("nav.signIn") },
    // Apple wants the privacy policy and a support contact reachable from inside the
    // app, not only from the App Store listing. This menu is on every route, so these
    // are those links. Support sits above Privacy because someone opening this menu
    // mid-problem is looking for help, not for a policy.
    { href: "/support", label: t("support.title") },
    { href: "/privacy", label: t("privacy.title") },
  ];

  const mobileLinks = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/fleet", label: t("nav.products"), icon: Tractor },
    { href: "/services", label: t("nav.services"), icon: Layers },
  ];

  return (
    <>
      {/* Top Header (Sticky) */}
      <header className="fixed top-0 left-0 right-0 z-50 surface rounded-none border-t-0 border-x-0 bg-[#06040d]/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={t("nav.menu")}
              aria-expanded={menuOpen}
              className="md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <Link href="/" className="flex items-center gap-2 group min-h-[44px]">
              <img src={logo} alt="ROBOTAT by NASL" className="h-10 w-auto object-contain drop-shadow-[0_0_14px_rgba(168,85,247,0.35)] group-hover:drop-shadow-[0_0_18px_rgba(168,85,247,0.55)] transition-all" />
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center">
            {desktopLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-[18px] py-2.5 text-body font-normal tracking-[-0.005em] transition-colors hover:text-foreground ${
                  // Inactive links must stay legible in their own right, not just be
                  // "the dim ones": WCAG AA wants 4.5:1 at this size, and /45 measured
                  // 4.09 against this background. /55 gives 5.69 while the active link
                  // sits at 18.19, so the current page still reads unmistakably.
                  location === link.href ? "text-foreground" : "text-foreground/55"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <LangToggle className="hidden sm:inline-flex" />
            <button
              onClick={() => openModal("nav-header")}
              // `min-h-[44px]` because the height here is padding-derived (py-2.5 over
              // text-label) and measured 38.8px — under the 44px floor at every width from
              // 640px up, which on iOS is every iPad and every landscape iPhone. `hidden sm:`
              // kept it out of the 375px audit, and no source guard can see a height that
              // only exists after layout.
              className="hidden sm:flex items-center min-h-[44px] px-[22px] py-2.5 rounded-full border border-foreground/25 text-foreground font-semibold text-label uppercase tracking-[0.14em] hover:border-[#c084fc] hover:text-[#c084fc] hover:bg-[#a855f7]/[0.06] transition-all duration-200"
            >
              {t("nav.bookDemo")}
            </button>
            <Link href={user ? "/dashboard" : "/auth"} className="inline-flex">
              <button
                aria-label={user ? t("nav.myDashboard") : t("nav.signIn")}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border transition-colors ${
                  user
                    ? "bg-primary/15 border-primary/40 text-[#c084fc] hover:bg-primary/25"
                    : "bg-white/5 border-white/10 text-foreground hover:bg-white/10"
                }`}
              >
                <User className="w-5 h-5" />
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile Menu (hamburger dropdown) */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} // overlay-ok
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: -12 }} // overlay-ok
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22 }}
              className="md:hidden fixed top-[88px] left-4 right-4 z-50 rounded-[20px] border border-[#a855f7]/[0.22] bg-[#0e0a1a]/95 backdrop-blur-2xl p-4 grid gap-1"
            >
              {menuLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center justify-between px-4 py-3.5 rounded-xl text-body transition-colors ${
                    location === link.href
                      ? "bg-[#a855f7]/[0.12] text-[#c084fc]"
                      : "text-foreground hover:bg-[#a855f7]/[0.08]"
                  }`}
                >
                  {link.label}
                  <ChevronRight className="w-4 h-4 opacity-50 rtl:rotate-180" />
                </Link>
              ))}
              <div className="mt-2 pt-3.5 border-t border-border flex items-center justify-between gap-3">
                <LangToggle />
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    openModal("nav-menu");
                  }}
                  className="flex-1 px-4 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-body hover:bg-[#a855f7] transition-colors"
                >
                  {t("nav.bookDemo")}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 surface rounded-none border-b-0 border-x-0 pb-safe bg-[#06040d]/95">
        <div className="flex items-center justify-around h-16 px-2">
          {mobileLinks.map((link) => {
            const isActive = location === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]" : ""}`} />
                <span className="text-label font-normal">{link.label}</span>
              </Link>
            );
          })}
          {/* Labelled `tabbar-contact` rather than something with "book" in it, because
              this is the one entry point whose label does not say what it opens: it reads
              "Contact" and shows a booking form. Whether that mismatch costs anything is
              the question this whole source field exists to answer — compare its opens
              against its submissions, not against the other doors' volume. */}
          <button
            onClick={() => openModal("tabbar-contact")}
            className="flex flex-col items-center justify-center w-full h-full gap-1 text-muted-foreground hover:text-primary transition-colors"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-label font-normal">{t("nav.contact")}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
