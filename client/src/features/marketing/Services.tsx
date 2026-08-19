import { motion } from "framer-motion";
import { Cpu, ShieldCheck, Wrench, BarChart3, ArrowRight } from "lucide-react";
import { useDemoModal } from "@/features/booking/DemoModalContext";
import { useI18n } from "@/i18n";
import { useSeo } from "@/lib/seo";
import { riseIn, riseOnMount } from "@/lib/motion";

// Aligned by index with dict.services.items. A fifth service added to the dictionary
// without an icon here would otherwise render `undefined` as a component, which React
// throws on — a blank page for the whole route rather than one tile with the wrong
// glyph. Hence the fallback below.
const SERVICE_ICONS = [Wrench, BarChart3, Cpu, ShieldCheck];

export default function Services() {
  const { openModal } = useDemoModal();
  const { t, dict } = useI18n();
  useSeo({
    title: "Services — End-to-End Autonomy",
    description:
      "Autonomous grass cutting, precision spraying, soil cultivation, and AI-driven fleet maintenance — from first setup to ongoing optimization.",
  });

  return (
    <div className="min-h-screen pt-28 pb-24 md:pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <motion.h1
            {...riseOnMount}
            className="text-heading font-semibold mb-6"
          >
            {t("services.endToEnd")} <span className="text-primary">{t("services.autonomyServices")}</span>
          </motion.h1>
          <motion.p
            {...riseOnMount}
            transition={{ ...riseOnMount.transition, delay: 0.1 }}
            className="text-body text-muted-foreground"
          >
            {t("services.sub")}
          </motion.p>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {dict.services.items.map((service, index) => {
            const Icon = SERVICE_ICONS[index] ?? Wrench;
            return (
              <motion.div
                key={index}
                {...riseIn}
                transition={{ ...riseIn.transition, delay: index * 0.1 }}
                className="surface p-8 rounded-3xl group hover:-translate-y-1 transition-all duration-300 hover:border-primary/30 flex flex-col"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform">
                  <Icon className="w-7 h-7" />
                </div>
                <h3 className="text-subhead font-semibold text-foreground mb-3">{service.title}</h3>
                <p className="text-body text-muted-foreground flex-1 mb-8">{service.description}</p>
                {/* One label for all of the service cards, not one per service: the
                    question this answers is which entry point converts, and every card
                    is the same entry point. Which service was on screen is already in
                    the booking itself. */}
                <button
                  onClick={() => openModal("services-card")}
                  className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-primary text-body font-semibold hover:bg-primary hover:text-white transition-all duration-300"
                >
                  {t("services.requestService")}
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* Closing CTA */}
        <motion.div
          {...riseIn}
          className="bg-gradient-to-br from-primary/20 to-secondary/30 rounded-3xl p-12 text-center border border-primary/20 relative overflow-hidden"
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.3)_0%,transparent_70%)] pointer-events-none" />
          <h2 className="text-heading font-semibold mb-4 relative z-10">{t("services.ctaTitle")}</h2>
          <p className="text-body text-muted-foreground mb-8 max-w-2xl mx-auto relative z-10">{t("services.ctaSub")}</p>
          <button
            onClick={() => openModal("services-cta")}
            className="relative z-10 inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-foreground text-background font-semibold text-body hover:bg-white hover:scale-105 transition-all duration-300"
          >
            {t("services.contactSales")} <ArrowRight className="w-5 h-5 rtl:rotate-180" />
          </button>
        </motion.div>

      </div>
    </div>
  );
}
