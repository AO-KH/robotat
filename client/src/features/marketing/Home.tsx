import { motion } from "framer-motion";
import { ArrowRight, Mail } from "lucide-react";
import { useDemoModal } from "@/features/booking/DemoModalContext";
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

const CAPABILITIES = [
  {
    num: "01",
    title: "Crop scouting & health",
    desc: "Multispectral and visual imaging across every row — disease, pests, and nutrient stress flagged before the eye can see them.",
  },
  {
    num: "02",
    title: "Precision spraying",
    desc: "Targeted application of pesticides, herbicides, and fertilizer — plant-by-plant. Less chemical use, lower drift, better outcomes.",
  },
  {
    num: "03",
    title: "Irrigation & soil mapping",
    desc: "Soil moisture, salinity, and topography mapped continuously. Irrigation runs by zone, by need — not by schedule.",
  },
  {
    num: "04",
    title: "Yield estimation & harvest support",
    desc: "Counting, sizing, and ripeness assessment before harvest. Plan logistics, labor, and storage with hard numbers instead of guesses.",
  },
  {
    num: "05",
    title: "Greenhouse & livestock monitoring",
    desc: "Climate inside, animals outside. Continuous welfare and condition checks for protected agriculture and pasture livestock.",
  },
];

const ENVIRONMENTS = [
  {
    corner: "01 · Open field",
    type: "— Orchards, vineyards & row crops",
    title: "Drives every row, all season.",
    desc: "Scouts crop health, cultivates soil, and sprays plant-by-plant across orchards, vineyards, and broadacre rows. Low ground pressure, GPS-tight navigation.",
    img: fieldImg,
    specs: [
      ["Row width", "0.9 – 2.4 m"],
      ["Tasks", "Scout · Cultivate · Spray"],
      ["Attachments", "X-Cultivator · X-Sprayer"],
    ],
  },
  {
    corner: "02 · Greenhouse",
    type: "— Protected & indoor agriculture",
    title: "Climate-aware, all day indoors.",
    desc: "Quiet, compact operation inside greenhouses and vertical farms — scouting and monitoring crop and climate in tight aisles, around the clock.",
    img: null,
    specs: [
      ["Aisle width", "0.5 m min"],
      ["Sensors", "RGB + multispectral + temp/RH"],
      ["Runtime", "All-day operation"],
    ],
  },
  {
    corner: "03 · Solar farm",
    type: "— Solar & infrastructure",
    title: "Keeps the panel rows clear.",
    desc: "Manages vegetation under and between panel rows — preventing shading and fire risk with no mowing crews and zero herbicide.",
    img: solarImg,
    specs: [
      ["Coverage", "Utility-scale sites"],
      ["Tasks", "Vegetation control"],
      ["Attachment", "X-Grass Cutter"],
    ],
  },
];

const PHASES = [
  {
    tag: "Phase 01",
    title: (
      <>
        We map your <span className="text-[#c084fc] italic">farm.</span>
      </>
    ),
    desc: "A ROBOTAT agronomy team walks your fields, defines scouting and treatment routes, and tailors the mission to your crop and season. No commitment, no charge for the assessment.",
    kv: [
      ["Site visit", "2–3 days in the field"],
      ["Mission plan", "Routes, schedules, KPIs"],
      ["Fleet sizing", "Right-sized for the work"],
    ],
  },
  {
    tag: "Phase 02",
    title: (
      <>
        Robots <span className="text-[#c084fc] italic">go to work.</span>
      </>
    ),
    desc: "Continuous autonomous patrols. Sensors collect inspection data, anomalies are surfaced in real time, and your operators see everything in a single dashboard.",
    kv: [
      ["Continuous", "24 / 7 autonomous operation"],
      ["Data layer", "Live to your dashboard"],
      ["Traceable", "Every patrol logged"],
    ],
  },
  {
    tag: "Phase 03",
    title: (
      <>
        Findings become <span className="text-[#c084fc] italic">actions.</span>
      </>
    ),
    desc: "Findings trigger work orders in your farm management system or ERP. Operators intervene only when they need to. The whole loop — detection to dispatch to resolution — closes automatically.",
    kv: [
      ["Integrations", "FMS · ERP"],
      ["Workflows", "Owner, SLA, escalation"],
      ["Reports", "Weekly to leadership"],
    ],
  },
];

export default function Home() {
  const { openModal } = useDemoModal();

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
            Autonomous robots,
            <br />
            <b className="font-semibold">built to work,</b>
            <br />
            <span className="text-[#c084fc] italic font-medium">wherever you need them</span>
          </h1>

          <p className="text-[17px] md:text-lg text-muted-foreground leading-relaxed max-w-2xl">
            One autonomous robot, built and operated by ROBOTAT for orchards, row crops, protected
            agriculture, and solar sites across the region.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={openModal}
              className="px-7 py-4 min-h-[48px] rounded-full bg-primary text-primary-foreground font-medium text-[15px] hover:bg-[#a855f7] transition-colors duration-200 flex items-center justify-center gap-2"
            >
              Book a site assessment <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </section>

      {/* ===== MARQUEE ===== */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20 md:pb-24">
        <motion.div {...fadeUp} className="max-w-6xl mx-auto">
          <div className="relative aspect-[16/10] md:aspect-[21/9] border border-[#a855f7]/[0.22] overflow-hidden bg-gradient-to-b from-[#281c40]/40 to-[#140e20]/20">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#c084fc] to-transparent z-10" />
            <img src={marqueeImg} alt="ROBOTAT robot operating in a date palm orchard" className="w-full h-full object-cover" />
            <div className="absolute bottom-4 md:bottom-6 inset-x-4 md:inset-x-6 z-10 flex justify-between items-end font-mono text-[11px] uppercase tracking-[0.14em] [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
              <span>ROBOTAT · Field</span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ===== CAPABILITIES ===== */}
      <section id="capabilities" className="px-4 sm:px-6 lg:px-8 py-16 md:py-24 scroll-mt-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            tag="What they do"
            title={
              <>
                Eyes on every row. <span className="text-[#c084fc] italic">Action in every hour</span>
              </>
            }
            sub="Five capabilities the ROBOTAT fleet delivers across orchards, row crops, and protected agriculture — measurable, repeatable, and integrated with your farm operating systems."
          />

          <div className="border-t border-border">
            {CAPABILITIES.map((cap) => (
              <motion.div
                {...fadeUp}
                key={cap.num}
                className="grid grid-cols-1 md:grid-cols-[90px_1fr] items-baseline gap-3 md:gap-8 py-8 md:py-9 border-b border-border transition-colors hover:bg-[#a855f7]/[0.03]"
              >
                <div className="font-mono text-[13px] text-[#c084fc] tracking-[0.16em]">— {cap.num}</div>
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
            tag="Where it works"
            title={
              <>
                One robot. <span className="text-[#c084fc] italic">Every environment</span>
              </>
            }
            sub="The MAX T100 doesn't change — the attachment does. One platform covers open fields, protected agriculture, and solar sites."
          />

          <motion.div
            {...fadeUp}
            className="grid grid-cols-1 md:grid-cols-3 border border-[#a855f7]/[0.22] bg-gradient-to-b from-[#281c40]/40 to-[#140e20]/25"
          >
            {ENVIRONMENTS.map((env, i) => (
              <div
                key={env.corner}
                className={`p-6 md:p-8 flex flex-col ${
                  i < 2 ? "border-b md:border-b-0 md:border-r border-border" : ""
                }`}
              >
                <div className="relative aspect-[16/11] mb-6 border border-border bg-[#06040d]/40 overflow-hidden">
                  {env.img ? (
                    <img src={env.img} alt={env.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[radial-gradient(ellipse_70%_60%_at_50%_40%,rgba(124,58,237,0.18),transparent_70%)] flex items-center justify-center">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Greenhouse · Coming soon
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
                  {env.specs.map(([l, v]) => (
                    <div key={l} className="flex justify-between gap-3 text-[12.5px]">
                      <b className="font-medium">{l}</b>
                      <span className="font-mono text-[11.5px] text-muted-foreground text-right">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            tag="How it works"
            title={
              <>
                Deploy. Inspect. <span className="text-[#c084fc] italic">Act</span>
              </>
            }
            sub="A three-step program from first farm visit to autonomous operation. Most deployments are live within 60 days."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {PHASES.map((phase) => (
              <motion.div {...fadeUp} key={phase.tag} className="glass-card rounded-2xl p-7 flex flex-col">
                <div className="eyebrow mb-4">{phase.tag}</div>
                <h3 className="text-[24px] font-medium tracking-[-0.015em] mb-3">{phase.title}</h3>
                <p className="text-[14.5px] text-muted-foreground leading-relaxed mb-6 flex-1">{phase.desc}</p>
                <div className="grid gap-2.5 pt-4 border-t border-border">
                  {phase.kv.map(([l, v]) => (
                    <div key={l} className="flex justify-between gap-3 text-[12.5px]">
                      <b className="font-medium">{l}</b>
                      <span className="font-mono text-[11.5px] text-muted-foreground text-right">{v}</span>
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
            Show us your farm.
            <br />
            We'll show you the robots.
          </h2>
          <p className="text-[16px] md:text-[17px] text-muted-foreground leading-relaxed">
            A ROBOTAT agronomist walks your farm in 2–3 days. No commitment. No charge for the assessment.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={openModal}
              className="px-8 py-4 min-h-[48px] rounded-full bg-primary text-primary-foreground font-medium text-[15px] hover:bg-[#a855f7] transition-colors duration-200 flex items-center justify-center gap-2"
            >
              Book a site assessment <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="mailto:info@nasl-tech.com"
              className="px-8 py-4 min-h-[48px] rounded-full border border-[#a855f7]/[0.22] font-medium text-[15px] hover:border-[#c084fc] hover:text-[#c084fc] transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <Mail className="w-4 h-4" /> Email the team
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 eyebrow text-muted-foreground">
            <span>Available across the Kingdom</span>
            <span>Response within 48 hrs</span>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
