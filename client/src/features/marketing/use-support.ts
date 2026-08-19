import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

interface SupportLinks {
  email: string;
  whatsappUrl: string;
  mailtoUrl: string;
}

/**
 * Help channels for the support page.
 *
 * Fetched rather than hard-coded because the business WhatsApp number and the
 * support inbox are server environment variables — a copy baked into the client
 * would keep pointing at the old number after they change, and the bundle inside
 * the iOS app cannot be corrected without an App Store release.
 *
 * Personalised when signed in, so the query key carries no user id: /support is
 * public and the cache is cleared on sign-out with the rest of the query cache.
 */
export function useSupportLinks() {
  return useQuery<SupportLinks>({
    queryKey: [api.contact.support.path],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const res = await fetch(api.contact.support.path);
      if (!res.ok) throw new Error("Failed to load support links");
      return (await res.json()) as SupportLinks;
    },
  });
}
