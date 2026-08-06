import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RegisterInput, type LoginInput } from "@shared/routes";
import type {
  PublicUser,
  UpdateProfileInput,
  ChangePasswordInput,
  DeleteAccountInput,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { isNativeApiMode } from "@/lib/api-base";
import { setAuthToken } from "@/lib/auth-token";
import { ME_KEY, clearSignedInState } from "./auth-state";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body?.message) return body.message as string;
  } catch {
    /* ignore */
  }
  return fallback;
}

/**
 * The account was created but the follow-up token exchange failed — which the shared
 * auth rate limiter makes reachable, since register and token draw on the same bucket.
 * Distinct from a registration failure because retrying registration would 409, and
 * the user simply needs to sign in.
 */
class RegisteredButNotSignedInError extends Error {
  constructor() {
    super("Your account was created, but signing in failed. Please sign in.");
    this.name = "RegisteredButNotSignedInError";
  }
}

/**
 * Exchange credentials for a bearer token and store it. Used only in the native
 * build, where the session cookie the website relies on is not dependable from the
 * capacitor:// origin. Returns the user so callers can treat it like a normal login.
 */
async function loginWithToken(data: LoginInput): Promise<PublicUser> {
  const res = await fetch(api.auth.token.path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(api.auth.token.input.parse(data)),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not sign in"));
  const body = (await res.json()) as { token: string; user: PublicUser };
  setAuthToken(body.token);
  return body.user;
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
      const user = (await res.json()) as PublicUser;

      // Registration signs the user in via cookie, which the native shell cannot use;
      // exchange the same credentials for a token so the app is actually authenticated.
      if (isNativeApiMode()) {
        try {
          await loginWithToken({ email: data.email, password: data.password });
        } catch {
          throw new RegisteredButNotSignedInError();
        }
      }
      return user;
    },
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user);
      toast({ title: "Welcome to ROBOTAT", description: "Your account is ready." });
    },
    onError: (err: Error) => {
      // The account may exist even though the mutation rejected; saying "Sign up
      // failed" there would send the user back into a retry that can only 409.
      const created = err instanceof RegisteredButNotSignedInError;
      toast({
        title: created ? "Account created" : "Sign up failed",
        description: err.message,
        variant: created ? "default" : "destructive",
      });
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: LoginInput) => {
      if (isNativeApiMode()) return loginWithToken(data);

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
      // Wipes the whole cache, not just the assessments key — see auth-state.ts for
      // why invalidation alone leaked the previous user's data on a shared device.
      clearSignedInState(qc);
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
  const qc = useQueryClient();
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

      // The server revokes every bearer token for this user on a password change, the
      // one this app is holding included. Swap it for a fresh one; if that fails, drop
      // it so the app fails closed and prompts a sign-in rather than 401ing silently.
      if (isNativeApiMode()) {
        const me = qc.getQueryData<PublicUser | null>(ME_KEY);
        try {
          if (!me?.email) throw new Error("no cached user");
          await loginWithToken({ email: me.email, password: data.newPassword });
        } catch {
          setAuthToken(null);
        }
      }
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

/**
 * A failed delete, carrying the HTTP status.
 *
 * `DELETE /api/auth/account` answers a wrong password with 401 and a bare `{ message }` —
 * no `field` key, unlike `changePassword`'s 400. So the status is the only thing that
 * tells the caller to put the error on the password input rather than treat it as a
 * generic failure, and the plain `Error` the other hooks throw would lose it.
 */
export class DeleteAccountError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DeleteAccountError";
  }
}

/** True when a delete failed because the password did not match. */
export function isWrongPassword(err: unknown): boolean {
  return err instanceof DeleteAccountError && err.status === 401;
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: DeleteAccountInput) => {
      const res = await fetch(api.auth.deleteAccount.path, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.auth.deleteAccount.input.parse(data)),
      });
      if (!res.ok) {
        throw new DeleteAccountError(res.status, await readError(res, "Could not delete your account"));
      }
      return true;
    },
    onSuccess: () => {
      // The same teardown as sign-out, and for a stronger reason: the account is gone,
      // so the dashboard, bookings and server-prefilled contact details still sitting in
      // the cache belong to nobody. `clearSignedInState` wipes the cache outright rather
      // than invalidating it — see auth-state.ts.
      clearSignedInState(qc);
    },
  });
}
