import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type BookAssessmentInput } from "@shared/routes";
import type { Assessment } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const LIST_KEY = ["/api/assessments"] as const;

export interface BookAssessmentResult {
  assessment: Assessment;
  whatsappUrl: string;
  mailtoUrl: string;
}

/** The signed-in user's assessment bookings, newest first. */
export function useMyAssessments(enabled = true) {
  return useQuery<Assessment[]>({
    queryKey: LIST_KEY,
    enabled,
    queryFn: async () => {
      const res = await fetch(api.assessments.list.path, { credentials: "include" });
      if (res.status === 401) return [];
      if (!res.ok) throw new Error("Failed to load your bookings");
      return (await res.json()) as Assessment[];
    },
  });
}

/** Prefilled WhatsApp + email links for a quick assessment inquiry (personalized when signed in). */
export function useContactLinks(enabled: boolean) {
  return useQuery({
    queryKey: ["/api/contact"],
    enabled,
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(api.contact.get.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load contact options");
      return (await res.json()) as { whatsappUrl: string; mailtoUrl: string };
    },
  });
}

/** Submit the booking form as a guest (no account) — returns prefilled channel links, saves nothing. */
export function useContactSubmit() {
  return useMutation({
    mutationFn: async (data: BookAssessmentInput) => {
      const res = await fetch(api.contact.submit.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(api.contact.submit.input.parse(data)),
      });
      if (!res.ok) throw new Error("Could not submit your request");
      return (await res.json()) as { whatsappUrl: string; mailtoUrl: string };
    },
  });
}

export function useBookAssessment() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: BookAssessmentInput): Promise<BookAssessmentResult> => {
      const res = await fetch(api.assessments.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.assessments.create.input.parse(data)),
      });
      if (!res.ok) {
        try {
          const body = await res.json();
          throw new Error(body?.message || "Could not submit your request");
        } catch (e) {
          throw e instanceof Error ? e : new Error("Could not submit your request");
        }
      }
      return (await res.json()) as BookAssessmentResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      toast({
        title: "Assessment requested",
        description: "Our agronomy team will reach out to schedule your visit.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Booking failed", description: err.message, variant: "destructive" });
    },
  });
}
