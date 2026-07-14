import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RegisterInput, type LoginInput } from "@shared/routes";
import type { PublicUser, UpdateProfileInput, ChangePasswordInput } from "@shared/schema";
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

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: UpdateProfileInput) => {
      const res = await fetch(api.auth.updateProfile.path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.auth.updateProfile.input.parse(data)),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not update profile"));
      return (await res.json()) as PublicUser;
    },
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user);
      toast({ title: "Profile updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });
}

export function useForgotPassword() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { email: string }) => {
      const res = await fetch(api.auth.forgotPassword.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(api.auth.forgotPassword.input.parse(data)),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not send the reset link"));
      return (await res.json()) as { ok: true; devToken?: string };
    },
    onError: (err: Error) => {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
    },
  });
}

export function useResetPassword() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { token: string; newPassword: string }) => {
      const res = await fetch(api.auth.resetPassword.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(api.auth.resetPassword.input.parse(data)),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not reset your password"));
      return true;
    },
    onSuccess: () => {
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't reset password", description: err.message, variant: "destructive" });
    },
  });
}

export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch(api.auth.verifyEmail.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.auth.verifyEmail.input.parse({ token })),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not verify your email"));
      return (await res.json()) as PublicUser;
    },
    onSuccess: (user) => {
      // If the user happens to be signed in, reflect the verified state immediately.
      qc.setQueryData(ME_KEY, (prev: PublicUser | null | undefined) => (prev ? user : prev));
    },
  });
}

export function useResendVerification() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(api.auth.resendVerification.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not resend the email"));
      return (await res.json()) as { ok: true; alreadyVerified?: boolean; devToken?: string };
    },
    onSuccess: (data) => {
      toast({
        title: data.alreadyVerified ? "Already verified" : "Verification email sent",
        description: data.alreadyVerified
          ? "Your email is already confirmed."
          : "Check your inbox for the confirmation link.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't resend", description: err.message, variant: "destructive" });
    },
  });
}

export function useChangePassword() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: ChangePasswordInput) => {
      const res = await fetch(api.auth.changePassword.path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.auth.changePassword.input.parse(data)),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not change password"));
      return true;
    },
    onSuccess: () => {
      toast({ title: "Password changed", description: "Your password has been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't change password", description: err.message, variant: "destructive" });
    },
  });
}
