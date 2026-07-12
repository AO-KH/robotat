import { motion } from "framer-motion";
import { ArrowRight, Mail } from "lucide-react";
import { useDemoModal } from "@/features/booking/DemoModalContext";
import { useI18n } from "@/i18n";
import type { ReactNode } from "react";

import marqueeImg from "@assets/06_1772321886237.png";
import fieldImg from "@assets/05_1771963956072.jpeg";
import solarImg from "@assets/solar_farm.jpeg";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5 },
};

// Environment images, aligned by index with dict.home.environments (greenhouse has none yet).
const ENV_IMAGES: (string | null)[] = [fieldImg, null, solarImg];

function SectionHead({ tag, title, sub }: { tag: string; title: ReactNode; sub?: string }) {
  return (
    <motion.div {...fadeUp} className="text-center max-w-3xl mx-auto mb-12 md:mb-16 px-4">
      <h2 className="text-gradient text-4xl md:text-[52px] font-semibold tracking-[-0.02em] leading-[1.06] mb-4 inline-block">
        {tag}
      </h2>
      <p className="text-xl md:text-[26px] text-muted-foreground font-medium leading-snug mb-4">{title}</p>
      {sub && <p className="text-[16px] md:text-[17px] text-muted-foreground leading-relaxed">{sub}</p>}
    </motion.div>
  );
}

export default function Home() {
  const { openModal } = useDemoModal();
  const { t, dict } = useI18n();
  const home = dict.home;

  return (
    <div className="min-h-screen pt-20 pb-24 md:pb-0 hero-gradient">
      {/* ===== HERO ===== */}
      <section className="px-4 sm:px-6 lg:px-8 pt-14 md:pt-24 pb-16 md:pb-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto flex flex-col items-center gap-7"
        >
          <h1 className="text-[44px] md:text-7xl lg:text-[84px] font-light tracking-[-0.035em] leading-[1.02]">
            {t("home.heroLine1")}
            <br />
            <b className="font-semibold">{t("home.heroLine2")}</b>
            <br />
            <span className="text-[#c084fc] italic font-medium">{t("home.heroLine3")}</span>
          </h1>

          <p className="text-[17px] md:text-lg text-muted-foreground leading-relaxed max-w-2xl">{t("home.heroSub")}</p>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={openModal}
              className="px-7 py-4 min-h-[48px] rounded-full bg-primary text-primary-foreground font-medium text-[15px] hover:bg-[#a855f7] transition-colors duration-200 flex items-center justify-center gap-2"
            >
              {t("home.bookAssessment")} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>
        </motion.div>
      </section>

      {/* ===== MARQUEE ===== */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20 md:pb-24">
        <motion.div {...fadeUp} className="max-w-6xl mx-auto">
          <div className="relative aspect-[16/10] md:aspect-[21/9] border border-[#a855f7]/[0.22] overflow-hidden bg-gradient-to-b from-[#281c40]/40 to-[#140e20]/20">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#c084fc] to-transparent z-10" />
            <img src={marqueeImg} alt="ROBOTAT" className="w-full h-full object-cover" />
            <div className="absolute bottom-4 md:bottom-6 inset-x-4 md:inset-x-6 z-10 flex justify-between items-end font-mono text-[11px] uppercase tracking-[0.14em] [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
              <span>{t("home.marqueeLabel")}</span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ===== CAPABILITIES ===== */}
      <section id="capabilities" className="px-4 sm:px-6 lg:px-8 py-16 md:py-24 scroll-mt-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            tag={t("home.capsTag")}
            title={
              <>
                {t("home.capsTitle1")} <span className="text-[#c084fc] italic">{t("home.capsTitle2")}</span>
              </>
            }
            sub={t("home.capsSub")}
          />

          <div className="border-t border-border">
            {home.capabilities.map((cap, i) => (
              <motion.div
                {...fadeUp}
                key={i}
                className="grid grid-cols-1 md:grid-cols-[90px_1fr] items-baseline gap-3 md:gap-8 py-8 md:py-9 border-b border-border transition-colors hover:bg-[#a855f7]/[0.03]"
              >
                <div className="font-mono text-[13px] text-[#c084fc] tracking-[0.16em]">— {String(i + 1).padStart(2, "0")}</div>
                <div>
                  <h3 className="text-[22px] md:text-[28px] font-medium tracking-[-0.015em] mb-2">{cap.title}</h3>
                  <p className="text-[15px] md:text-[15.5px] text-muted-foreground leading-relaxed max-w-2xl">{cap.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHERE IT WORKS ===== */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            tag={t("home.envTag")}
            title={
              <>
                {t("home.envTitle1")} <span className="text-[#c084fc] italic">{t("home.envTitle2")}</span>
              </>
            }
            sub={t("home.envSub")}
          />

          <motion.div
            {...fadeUp}
            className="grid grid-cols-1 md:grid-cols-3 border border-[#a855f7]/[0.22] bg-gradient-to-b from-[#281c40]/40 to-[#140e20]/25"
          >
            {home.environments.map((env, i) => {
              const img = ENV_IMAGES[i];
              return (
                <div
                  key={i}
                  className={`p-6 md:p-8 flex flex-col ${i < 2 ? "border-b md:border-b-0 md:border-r border-border" : ""}`}
                >
                  <div className="relative aspect-[16/11] mb-6 border border-border bg-[#06040d]/40 overflow-hidden">
                    {img ? (
                      <img src={img} alt={env.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[radial-gradient(ellipse_70%_60%_at_50%_40%,rgba(124,58,237,0.18),transparent_70%)] flex items-center justify-center">
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {t("home.greenhouseComingSoon")}
                        </span>
                      </div>
                    )}
                    <span className="absolute top-3 left-3 font-mono text-[10px] text-[#c084fc] tracking-[0.14em] bg-black/50 px-2 py-1">
                      {env.corner}
                    </span>
                  </div>

                  <div className="eyebrow mb-2.5 normal-case tracking-[0.08em]">{env.type}</div>
                  <h4 className="text-[22px] md:text-2xl font-semibold tracking-[-0.015em] mb-3">{env.title}</h4>
                  <p className="text-[14.5px] text-muted-foreground leading-relaxed mb-5 flex-1">{env.desc}</p>

                  <div className="grid gap-2.5 pt-4 border-t border-border">
                    {env.specs.map((s) => (
                      <div key={s.label} className="flex justify-between gap-3 text-[12.5px]">
                        <b className="font-medium">{s.label}</b>
                        <span className="font-mono text-[11.5px] text-muted-foreground text-right">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            tag={t("home.howTag")}
            title={
              <>
                {t("home.howTitle1")} <span className="text-[#c084fc] italic">{t("home.howTitle2")}</span>
              </>
            }
            sub={t("home.howSub")}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {home.phases.map((phase, i) => (
              <motion.div {...fadeUp} key={i} className="glass-card rounded-2xl p-7 flex flex-col">
                <div className="eyebrow mb-4">{phase.tag}</div>
                <h3 className="text-[24px] font-medium tracking-[-0.015em] mb-3">
                  {phase.titlePlain} <span className="text-[#c084fc] italic">{phase.titleAccent}</span>
                </h3>
                <p className="text-[14.5px] text-muted-foreground leading-relaxed mb-6 flex-1">{phase.desc}</p>
                <div className="grid gap-2.5 pt-4 border-t border-border">
                  {phase.kv.map((k) => (
                    <div key={k.label} className="flex justify-between gap-3 text-[12.5px]">
                      <b className="font-medium">{k.label}</b>
                      <span className="font-mono text-[11.5px] text-muted-foreground text-right">{k.value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA BAND ===== */}
      <section className="px-4 sm:px-6 lg:px-8 py-20 md:py-28 text-center">
        <motion.div {...fadeUp} className="max-w-3xl mx-auto flex flex-col items-center gap-6">
          <h2 className="text-gradient text-4xl md:text-[56px] font-semibold tracking-[-0.02em] leading-[1.08] inline-block">
            {t("home.ctaTitle1")}
            <br />
            {t("home.ctaTitle2")}
          </h2>
          <p className="text-[16px] md:text-[17px] text-muted-foreground leading-relaxed">{t("home.ctaSub")}</p>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={openModal}
              className="px-8 py-4 min-h-[48px] rounded-full bg-primary text-primary-foreground font-medium text-[15px] hover:bg-[#a855f7] transition-colors duration-200 flex items-center justify-center gap-2"
            >
              {t("home.bookAssessment")} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
            <a
              href="mailto:info@nasl-tech.com"
              className="px-8 py-4 min-h-[48px] rounded-full border border-[#a855f7]/[0.22] font-medium text-[15px] hover:border-[#c084fc] hover:text-[#c084fc] transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <Mail className="w-4 h-4" /> {t("home.emailTeam")}
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 eyebrow text-muted-foreground">
            <span>{t("home.metaKingdom")}</span>
            <span>{t("home.metaResponse")}</span>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
