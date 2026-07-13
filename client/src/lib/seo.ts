import { useEffect } from "react";

const SITE = "ROBOTAT";

function setMeta(attr: "name" | "property", key: string, content: string | undefined) {
  if (content === undefined) return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

interface SeoOptions {
  title: string;
  description?: string;
  /** When true, tell crawlers not to index this route (login/account pages). */
  noindex?: boolean;
}

/**
 * Per-route SEO for this client-rendered SPA: updates the document title,
 * description, Open Graph/Twitter tags, and the robots directive on mount.
 */
export function useSeo({ title, description, noindex }: SeoOptions) {
  useEffect(() => {
    const fullTitle = title.includes(SITE) ? title : `${title} | ${SITE}`;
    document.title = fullTitle;

    setMeta("name", "description", description);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
  }, [title, description, noindex]);
}
