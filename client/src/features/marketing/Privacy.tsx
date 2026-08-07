import { motion } from "framer-motion";
import { useI18n } from "@/i18n";
import { useSeo } from "@/lib/seo";
import { riseOnMount } from "@/lib/motion";

/** One heading plus its paragraph. Keeps the section list below readable. */
function Section({ heading, body }: { heading: string; body: string }) {
  return (
    <section className="mt-8">
      <h2 className="text-subhead font-semibold mb-2">{heading}</h2>
      <p className="text-body text-muted-foreground leading-relaxed">{body}</p>
    </section>
  );
}

export default function Privacy() {
  const { t } = useI18n();
  useSeo({ title: "Privacy Policy" });

  return (
    <div className="min-h-screen pt-28 pb-28 md:pb-12 px-4 sm:px-6 lg:px-8">
      <motion.div {...riseOnMount} className="max-w-2xl mx-auto">
        <h1 className="text-heading font-semibold">{t("privacy.title")}</h1>
        <p className="text-label text-muted-foreground mt-1">{t("privacy.updated")}</p>
        <p className="text-body text-muted-foreground leading-relaxed mt-6">{t("privacy.intro")}</p>

        <section className="mt-8">
          <h2 className="text-subhead font-semibold mb-2">{t("privacy.collectHeading")}</h2>
          {/* ps-5, not pl-5: the logical property moves the bullet indent to the right
              edge under RTL, which pl- does not. */}
          <ul className="space-y-2 text-body text-muted-foreground leading-relaxed list-disc ps-5">
            {/* Ordered from what a customer hands over deliberately to what the system
                keeps on their behalf, so the surprising entries come last. */}
            <li>{t("privacy.collectAccount")}</li>
            <li>{t("privacy.collectBooking")}</li>
            <li>{t("privacy.collectSession")}</li>
            <li>{t("privacy.collectUsage")}</li>
            <li>{t("privacy.collectPush")}</li>
          </ul>
        </section>

        <Section heading={t("privacy.useHeading")} body={t("privacy.useBody")} />
        <Section heading={t("privacy.shareHeading")} body={t("privacy.shareBody")} />
        <Section heading={t("privacy.retainHeading")} body={t("privacy.retainBody")} />
        <Section heading={t("privacy.rightsHeading")} body={t("privacy.rightsBody")} />
        <Section heading={t("privacy.contactHeading")} body={t("privacy.contactBody")} />
      </motion.div>
    </div>
  );
}
