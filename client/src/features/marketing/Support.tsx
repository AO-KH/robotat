import { motion } from "framer-motion";
import { Link } from "wouter";
import { Mail, ArrowRight } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useI18n } from "@/i18n";
import { useSeo } from "@/lib/seo";
import { riseIn, riseOnMount } from "@/lib/motion";
import { useSupportLinks } from "./use-support";

/**
 * The page App Store Connect is given as the Support URL, and the only place in the
 * product that answers "something is wrong, now what".
 *
 * Its one hard requirement is that it still works when nothing else does. Whoever
 * reads this page is disproportionately likely to be here *because* the API is
 * refusing them — so the contact details are never gated on a successful fetch. The
 * live links are an upgrade over the static fallback below, not a precondition for
 * the page being useful.
 */

/**
 * Shown until (or instead of) the server's answer.
 *
 * Duplicates FALLBACK_SUPPORT_INBOX in server/lib/notify.ts. That duplication is the
 * point: a support page whose address arrives over the same API the reader cannot
 * reach is no use to them. Already published in the privacy policy and on the home
 * page, so it is not a new commitment. Change all three together.
 */
const FALLBACK_EMAIL = "info@nasl-tech.com";

export default function Support() {
  const { t, dict } = useI18n();
  const { data } = useSupportLinks();

  useSeo({
    title: "Support",
    description:
      "Get help with the ROBOTAT app — booking a site assessment, tracking its status, notifications, and account questions.",
  });

  const email = data?.email ?? FALLBACK_EMAIL;
  const mailtoUrl = data?.mailtoUrl ?? `mailto:${FALLBACK_EMAIL}?subject=ROBOTAT%20support`;

  return (
    <div className="min-h-screen pt-28 pb-28 md:pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <motion.div {...riseOnMount}>
          <h1 className="text-heading font-semibold">{t("support.title")}</h1>
          <p className="text-body text-muted-foreground leading-relaxed mt-6">
            {t("support.intro")}
          </p>
          <p className="text-label text-muted-foreground mt-3">{t("support.hours")}</p>
        </motion.div>

        {/* Same two channels, and the same treatment, as the booking modal — a
            customer who has booked once should recognise where they are. */}
        <motion.div {...riseIn} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-10">
          {/* Absent a server answer there is no number to open a chat with, so the
              WhatsApp card is only rendered once the real link is in hand. Email
              always works — mailto needs nothing from us. */}
          {data?.whatsappUrl && (
            <a
              href={data.whatsappUrl}
              className="flex flex-col items-center gap-2 py-6 px-3 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/20 transition-colors text-center"
            >
              <SiWhatsapp className="w-8 h-8 text-[#25D366]" />
              <span className="text-body font-semibold">{t("support.whatsapp")}</span>
              <span className="text-label text-muted-foreground leading-tight">
                {t("support.whatsappSub")}
              </span>
            </a>
          )}
          <a
            href={mailtoUrl}
            className="flex flex-col items-center gap-2 py-6 px-3 rounded-2xl bg-primary/10 border border-primary/30 hover:bg-primary/20 transition-colors text-center"
          >
            <Mail className="w-8 h-8 text-[#c084fc]" />
            <span className="text-body font-semibold">{t("support.email")}</span>
            <span className="text-label text-muted-foreground leading-tight">
              {t("support.emailSub")}
            </span>
          </a>
        </motion.div>

        {/* The address in full, for a device with no mail client wired up — where the
            mailto card above does nothing at all when tapped. */}
        <p className="text-label text-muted-foreground mt-4 text-center">
          {t("support.emailCopy")}{" "}
          {/* dir="ltr" so an address never reorders inside the RTL paragraph. */}
          <a href={`mailto:${email}`} dir="ltr" className="text-[#c084fc] hover:underline">
            {email}
          </a>
        </p>

        <motion.section {...riseIn} className="mt-16">
          <h2 className="text-subhead font-semibold mb-4">{t("support.faqHeading")}</h2>
          <Accordion type="single" collapsible className="w-full">
            {dict.support.faq.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                {/* text-start, not text-left: the trigger is flex and the question has
                    to sit against the reading edge under RTL too. */}
                <AccordionTrigger className="text-body font-semibold text-start">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-body text-muted-foreground leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.section>

        <motion.section {...riseIn} className="mt-12">
          <h2 className="text-subhead font-semibold mb-2">{t("support.privacyHeading")}</h2>
          <p className="text-body text-muted-foreground leading-relaxed">
            {t("support.privacyBody")}
          </p>
          <Link
            href="/privacy"
            className="inline-flex items-center gap-2 mt-4 text-body text-[#c084fc] hover:underline"
          >
            {t("support.privacyLink")}
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </Link>
        </motion.section>
      </div>
    </div>
  );
}
