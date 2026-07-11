import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, User, Home, Tractor, Layers, MessageSquare, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useDemoModal } from "@/features/booking/DemoModalContext";
import { useCurrentUser } from "@/features/auth/use-auth";

import logo from "@assets/Robtat_by_Nasl_Logo-02_1771961617038.png";

export function Navigation() {
  const [location] = useLocation();
  const { openModal } = useDemoModal();
  const { data: user } = useCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the menu whenever the route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  const desktopLinks = [
    { href: "/", label: "Home" },
    { href: "/fleet", label: "Our Products" },
    { href: "/services", label: "Services" },
  ];

  const menuLinks = [
    { href: "/", label: "Home" },
    { href: "/fleet", label: "Our Products" },
    { href: "/services", label: "Services" },
    user ? { href: "/dashboard", label: "My dashboard" } : { href: "/auth", label: "Sign in" },
  ];

  const mobileLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/fleet", label: "Products", icon: Tractor },
    { href: "/services", label: "Services", icon: Layers },
  ];

  return (
    <>
      {/* Top Header (Sticky) */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-card rounded-none border-t-0 border-x-0 bg-[#06040d]/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Menu"
              aria-expanded={menuOpen}
              className="md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <Link href="/" className="flex items-center gap-2 group">
              <img src={logo} alt="ROBOTAT by NASL" className="h-10 w-auto object-contain drop-shadow-[0_0_14px_rgba(168,85,247,0.35)] group-hover:drop-shadow-[0_0_18px_rgba(168,85,247,0.55)] transition-all" />
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center">
            {desktopLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-[18px] py-2.5 text-[13px] font-medium uppercase tracking-[0.14em] transition-colors hover:text-foreground ${
                  location === link.href ? "text-foreground" : "text-foreground/60"
                }`}
              >
                {link.label}
                {location === link.href && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#c084fc] shadow-[0_0_8px_#c084fc]" />
                )}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <button
              onClick={openModal}
              className="hidden sm:flex px-[22px] py-2.5 rounded-full border border-foreground/25 text-foreground font-medium text-[13px] uppercase tracking-[0.14em] hover:border-[#c084fc] hover:text-[#c084fc] hover:bg-[#a855f7]/[0.06] transition-all duration-200"
            >
              Book a Demo
            </button>
            <Link href={user ? "/dashboard" : "/auth"}>
              <button
                aria-label={user ? "Dashboard" : "Sign in"}
                className={`p-2.5 rounded-full border transition-colors ${
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22 }}
              className="md:hidden fixed top-[88px] left-4 right-4 z-50 rounded-[20px] border border-[#a855f7]/[0.22] bg-[#0e0a1a]/95 backdrop-blur-2xl p-4 grid gap-1"
            >
              {menuLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center justify-between px-4 py-3.5 rounded-xl text-base transition-colors ${
                    location === link.href
                      ? "bg-[#a855f7]/[0.12] text-[#c084fc]"
                      : "text-foreground hover:bg-[#a855f7]/[0.08]"
                  }`}
                >
                  {link.label}
                  <ChevronRight className="w-4 h-4 opacity-50" />
                </Link>
              ))}
              <div className="mt-2 pt-3.5 border-t border-border">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    openModal();
                  }}
                  className="w-full px-4 py-3.5 rounded-full bg-primary text-primary-foreground font-medium text-[15px] hover:bg-[#a855f7] transition-colors"
                >
                  Book a Demo
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-card rounded-none border-b-0 border-x-0 pb-safe bg-[#06040d]/95">
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
                <span className="text-[10px] font-medium">{link.label}</span>
              </Link>
            );
          })}
          <button
            onClick={openModal}
            className="flex flex-col items-center justify-center w-full h-full gap-1 text-muted-foreground hover:text-primary transition-colors"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-[10px] font-medium">Contact</span>
          </button>
        </div>
      </nav>
    </>
  );
}
