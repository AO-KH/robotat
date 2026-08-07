import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminUserSummary,
  Assessment,
  AssessmentStatus,
  UpdateAssessmentInput,
  AnalyticsSummary,
} from "@shared/schema";
import { useCurrentUser } from "@/features/auth/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n";
import { apiError, errorText } from "@/lib/api-error";

const LIST_KEY = "/api/admin/assessments";

/**
 * Both reads below are guarded by `requireStaff` on the server, so for a signed-out or
 * customer visitor they can only ever 403 — and with `retry: 2` that is now three
 * failed requests each, fired in the moment before the route guard's redirect lands.
 * Gating on the session means we never ask a question we already know the answer to.
 * `enabled: false` reports `fetchStatus: "idle"`, so `isLoading` stays false and this
 * cannot strand a screen on a spinner; both screens short-circuit on the same check
 * before they render a QueryState anyway.
 */
function useIsStaff(): boolean {
  const { data: user } = useCurrentUser();
  return user?.role === "staff";
}

/** All bookings across users (staff only), optionally filtered by status. */
export function useAllAssessments(status?: AssessmentStatus) {
  const isStaff = useIsStaff();
  return useQuery<Assessment[]>({
    queryKey: [LIST_KEY, status ?? "all"],
    enabled: isStaff,
    queryFn: async () => {
      const url = status ? `${LIST_KEY}?status=${status}` : LIST_KEY;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load assessments");
      return (await res.json()) as Assessment[];
    },
  });
}

/** Every registered account with its booking count (staff only). */
export function useAdminUsers() {
  const isStaff = useIsStaff();
  return useQuery<AdminUserSummary[]>({
    queryKey: ["/api/admin/users"],
    enabled: isStaff,
    queryFn: async () => {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load users");
      return (await res.json()) as AdminUserSummary[];
    },
  });
}

/** Aggregate analytics summary (staff only). */
export function useAnalytics() {
  const isStaff = useIsStaff();
  return useQuery<AnalyticsSummary>({
    queryKey: ["/api/admin/analytics"],
    enabled: isStaff,
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
  const { t } = useI18n();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & UpdateAssessmentInput) => {
      const res = await fetch(`${LIST_KEY}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await apiError(res, t("toast.shared.generic"));
      return (await res.json()) as Assessment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LIST_KEY] });
      toast({ title: t("toast.adminUpdate.successTitle"), description: t("toast.adminUpdate.successBody") });
    },
    onError: (e: Error) => {
      toast({
        title: t("toast.adminUpdate.failedTitle"),
        description: errorText(e, {
          400: t("toast.shared.invalid"),
          401: t("toast.shared.signedOut"),
          403: t("toast.shared.staffOnly"),
          404: t("toast.adminUpdate.notFound"),
        }),
        variant: "destructive",
      });
    },
  });
}
