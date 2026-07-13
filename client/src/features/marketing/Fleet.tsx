import { motion, AnimatePresence } from "framer-motion";
import { Target, X, ChevronRight, Loader2 } from "lucide-react";
import { useDemoModal } from "@/features/booking/DemoModalContext";
import { useProducts } from "@/features/marketing/use-products";
import { useI18n } from "@/i18n";
import { useSeo } from "@/lib/seo";
import { useState } from "react";
import type { Product } from "@shared/schema";

import maxT100Img from "@assets/max_t100_robot.png";
import grassCutterImg from "@assets/XMachines_GC02_1771963974422.JPG";
import cultivatorImg from "@assets/Gemini_Generated_Image_46wxzi46wxzi46wx_1771964517234.png";
import sprayerImg from "@assets/Untitled_Project_(8)_1771966958954.jpg";

// Product images stay in the bundle (optimized by Vite), keyed by DB slug.
const PRODUCT_IMAGES: Record<string, string> = {
  "max-t100": maxT100Img,
  "x-grass-cutter": grassCutterImg,
  "x-cultivator": cultivatorImg,
  "x-sprayer": sprayerImg,
};

export default function Fleet() {
  const { openModal } = useDemoModal();
  const { t, lang } = useI18n();
  const { data: products = [], isLoading } = useProducts();
  const [selected, setSelected] = useState<Product | null>(null);
  useSeo({
    title: "Products — MAX T100 & Attachments",
    description:
      "Meet the MAX T100 autonomous platform and its ecosystem of attachments — X-Grass Cutter, X-Cultivator, and X-Sprayer. One base, every job in the field.",
  });

  const role = (p: Product) => (lang === "ar" ? p.roleAr : p.roleEn);
  const desc = (p: Product) => (lang === "ar" ? p.descriptionAr : p.descriptionEn);
  const isPlatform = (p: Product) => p.kind === "platform";

  return (
    <div className="min-h-screen pt-28 pb-24 md:pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-gradient text-4xl md:text-[52px] font-semibold tracking-[-0.02em] leading-[1.06] mb-4 inline-block"
          >
            {t("fleet.ourProducts")}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-xl md:text-[26px] text-muted-foreground font-medium leading-snug mb-4"
          >
            {t("fleet.onePlatform")} <span className="text-[#c084fc] italic">{t("fleet.unlimitedAttachments")}</span>
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-[16px] md:text-[17px] text-muted-foreground leading-relaxed"
          >
            {t("fleet.sub")}
          </motion.p>
        </div>

        {/* Fleet Grid */}
        {isLoading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {products.map((product, i) => (
              <motion.div
                key={product.slug}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass-card rounded-3xl overflow-hidden border-white/10 hover:border-primary/50 transition-colors duration-500 group flex flex-col cursor-pointer"
                onClick={() => setSelected(product)}
              >
                <div className={`h-64 relative overflow-hidden ${isPlatform(product) ? "bg-[radial-gradient(ellipse_80%_70%_at_50%_40%,rgba(124,58,237,0.22),transparent_70%)]" : "bg-black/50"}`}>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#15101f] to-transparent z-10" />
                  <div
                    className={`absolute top-4 left-4 rtl:left-auto rtl:right-4 z-20 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase ${
                      isPlatform(product)
                        ? "bg-primary text-white shadow-[0_0_15px_rgba(168,85,247,0.6)]"
                        : "bg-white/10 text-white/70 border border-white/20"
                    }`}
                  >
                    {isPlatform(product) ? t("fleet.basePlatform") : t("fleet.attachmentTool")}
                  </div>
                  <img
                    src={PRODUCT_IMAGES[product.slug]}
                    alt={product.name}
                    className={`w-full h-full ${isPlatform(product) ? "object-contain p-4" : "object-cover"} group-hover:scale-110 transition-transform duration-700`}
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 z-30">
                    <div className="px-6 py-2 bg-primary rounded-full text-white text-sm font-bold shadow-2xl flex items-center gap-2">
                      {t("fleet.viewDetails")} <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                    </div>
                  </div>
                </div>
                <div className="p-8 relative z-20 flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-2xl font-bold font-mono">{product.name}</h3>
                    <span className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                      <Target className="w-5 h-5" />
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-primary mb-4 uppercase tracking-wider">{role(product)}</p>
                  <p className="text-muted-foreground flex-1 line-clamp-2">{desc(product)}</p>

                  <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-end">
                    <div className="text-primary text-xs font-bold hover:underline flex items-center gap-1">
                      {t("fleet.details")} <ChevronRight className="w-3 h-3 rtl:rotate-180" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Product Detail Modal */}
        <AnimatePresence>
          {selected && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelected(null)}
                className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md"
              />
              <div className="fixed inset-0 z-[111] flex items-center justify-center p-4 pointer-events-none">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 40 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 40 }}
                  className="w-full max-w-4xl bg-[#15101f] border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden pointer-events-auto max-h-[90vh] flex flex-col"
                >
                  <div className="relative h-72 md:h-96 shrink-0">
                    <img
                      src={PRODUCT_IMAGES[selected.slug]}
                      alt={selected.name}
                      className={`w-full h-full ${isPlatform(selected) ? "object-contain p-6 bg-[radial-gradient(ellipse_80%_70%_at_50%_40%,rgba(124,58,237,0.22),transparent_70%)]" : "object-cover"}`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#15101f] via-transparent to-transparent" />
                    <button
                      onClick={() => setSelected(null)}
                      className="absolute top-6 right-6 rtl:right-auto rtl:left-6 p-2 rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-primary transition-colors border border-white/10"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="p-8 md:p-12 overflow-y-auto">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                      <div>
                        <h2 className="text-4xl font-bold font-mono mb-2">{selected.name}</h2>
                        <p className="text-primary font-bold tracking-widest uppercase text-sm">{role(selected)}</p>
                      </div>
                      <button
                        onClick={() => {
                          setSelected(null);
                          openModal();
                        }}
                        className="px-8 py-4 rounded-full bg-primary text-white font-medium hover:bg-[#a855f7] transition-colors whitespace-nowrap"
                      >
                        {t("fleet.bookDemo")}
                      </button>
                    </div>

                    <p className="text-lg text-muted-foreground mb-12 leading-relaxed">{desc(selected)}</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {selected.specs.map((spec, i) => (
                        <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/10">
                          <h4 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">
                            {lang === "ar" ? spec.labelAr : spec.labelEn}
                          </h4>
                          <p className="font-bold text-foreground">{lang === "ar" ? spec.valueAr : spec.valueEn}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>

        {/* Command Center */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-3xl overflow-hidden glass-card p-1"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-secondary/40 to-primary/20 mix-blend-overlay" />
          <div className="bg-[#06040d] rounded-[1.35rem] p-8 md:p-16 relative z-10 border border-white/5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-6">{t("fleet.commandCenter")}</h2>
                <p className="text-lg text-muted-foreground mb-8 leading-relaxed">{t("fleet.commandCenterDesc")}</p>
                <button
                  onClick={openModal}
                  className="px-6 py-3 rounded-full border border-[#a855f7]/[0.22] hover:border-[#c084fc] hover:text-[#c084fc] text-foreground font-medium transition-colors"
                >
                  {t("fleet.requestPlatformDemo")}
                </button>
              </div>
              <div className="relative h-64 md:h-80 rounded-2xl border border-white/10 bg-[#15101f] overflow-hidden shadow-2xl flex items-center justify-center">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
                <div className="relative z-10 glass-card p-6 rounded-xl w-3/4 shadow-2xl border-primary/30">
                  <div className="flex gap-2 mb-4">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-[#5eead4] shadow-[0_0_8px_#5eead4]" />
                  </div>
                  <div className="space-y-3">
                    <div className="h-4 bg-white/10 rounded w-1/3" />
                    <div className="h-20 bg-primary/20 rounded border border-primary/30" />
                    <div className="h-4 bg-white/10 rounded w-full" />
                    <div className="h-4 bg-white/10 rounded w-4/5" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
