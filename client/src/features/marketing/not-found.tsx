import { Link } from "wouter";
import { Compass } from "lucide-react";
import { useI18n } from "@/i18n";
import { useSeo } from "@/lib/seo";

/**
 * Was unmodified Replit scaffold — `bg-gray-50`/`text-gray-900` light-mode colours on a
 * dark app, and "Did you forget to add the page to the router?" as the body copy. That
 * ships to the App Store, so it gets the same tokens, type roles and 44px target as
 * every other screen, and real copy in both languages.
 */
export default function NotFound() {
  const { t } = useI18n();
  useSeo({ title: t("notFound.title"), noindex: true });

  return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center">
      <div className="surface rounded-3xl py-12 px-6 max-w-md">
        <div className="w-12 h-12 rounded-xl bg-white/5 text-primary flex items-center justify-center mx-auto mb-6">
          <Compass className="w-6 h-6" />
        </div>
        <h1 className="text-subhead font-semibold mb-2">{t("notFound.title")}</h1>
        <p className="text-body text-muted-foreground mb-8">{t("notFound.body")}</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center min-h-[44px] px-6 rounded-full bg-primary text-primary-foreground text-body font-semibold hover:bg-[#a855f7] transition-colors"
        >
          {t("notFound.backHome")}
        </Link>
      </div>
    </div>
  );
}
