import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RegisterInput, type LoginInput } from "@shared/routes";
import type { PublicUser } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const ME_KEY = ["/api/auth/me"] as const;

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body?.message) return body.message as string;
  } catch {
    /* ignore */
  }
  return fallback;
}

/** Current user (null when signed out). */
export function useCurrentUser() {
  return useQuery<PublicUser | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      const res = await fetch(api.auth.me.path, { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to load session");
      return (await res.json()) as PublicUser;
    },
    staleTime: 1000 * 60,
  });
}

export function useRegister() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: RegisterInput) => {
      const res = await fetch(api.auth.register.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.auth.register.input.parse(data)),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not create account"));
      return (await res.json()) as PublicUser;
    },
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user);
      toast({ title: "Welcome to ROBOTAT", description: "Your account is ready." });
    },
    onError: (err: Error) => {
      toast({ title: "Sign up failed", description: err.message, variant: "destructive" });
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: LoginInput) => {
      const res = await fetch(api.auth.login.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.auth.login.input.parse(data)),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not sign in"));
      return (await res.json()) as PublicUser;
    },
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user);
      toast({ title: "Signed in", description: `Welcome back, ${user.name.split(" ")[0]}.` });
    },
    onError: (err: Error) => {
      toast({ title: "Sign in failed", description: err.message, variant: "destructive" });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await fetch(api.auth.logout.path, { method: "POST", credentials: "include" });
    },
    onSuccess: () => {
      qc.setQueryData(ME_KEY, null);
      qc.invalidateQueries({ queryKey: ["/api/assessments"] });
    },
  });
}
