import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Assessment, AssessmentStatus, UpdateAssessmentInput, AnalyticsSummary } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const LIST_KEY = "/api/admin/assessments";

/** All bookings across users (staff only), optionally filtered by status. */
export function useAllAssessments(status?: AssessmentStatus) {
  return useQuery<Assessment[]>({
    queryKey: [LIST_KEY, status ?? "all"],
    queryFn: async () => {
      const url = status ? `${LIST_KEY}?status=${status}` : LIST_KEY;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load assessments");
      return (await res.json()) as Assessment[];
    },
  });
}

/** Aggregate analytics summary (staff only). */
export function useAnalytics() {
  return useQuery<AnalyticsSummary>({
    queryKey: ["/api/admin/analytics"],
    queryFn: async () => {
      const res = await fetch("/api/admin/analytics", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load analytics");
      return (await res.json()) as AnalyticsSummary;
    },
  });
}

export function useUpdateAssessment() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & UpdateAssessmentInput) => {
      const res = await fetch(`${LIST_KEY}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = await res.json().then((b) => b?.message).catch(() => null);
        throw new Error(msg || "Update failed");
      }
      return (await res.json()) as Assessment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LIST_KEY] });
      toast({ title: "Updated", description: "The booking was updated." });
    },
    onError: (e: Error) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    },
  });
}
