import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RegisterInput, type LoginInput } from "@shared/routes";
import type {
  PublicUser,
  UpdateProfileInput,
  ChangePasswordInput,
  DeleteAccountInput,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n";
import { ApiError, apiError, errorText } from "@/lib/api-error";
import { isNativeApiMode } from "@/lib/api-base";
import { firstName } from "@/lib/utils";
import { getAuthToken, setAuthToken } from "@/lib/auth-token";
import { teardownPush } from "@/lib/push";
import { ME_KEY, clearSignedInState } from "./auth-state";

/**
 * The account was created but the follow-up token exchange failed — which the shared
 * auth rate limiter makes reachable, since register and token draw on the same bucket.
 * Distinct from a registration failure because retrying registration would 409, and
 * the user simply needs to sign in.
 *
 * Carries no user-facing prose of its own: the toast for it is looked up from the
 * dictionary at the call site like every other one.
 */
class RegisteredButNotSignedInError extends Error {
  constructor() {
    super("registered but the token exchange failed");
    this.name = "RegisteredButNotSignedInError";
  }
}

/**
 * Exchange credentials for a bearer token and store it. Used only in the native
 * build, where the session cookie the website relies on is not dependable from the
 * capacitor:// origin. Returns the user so callers can treat it like a normal login.
 *
 * `fallback` is the already-translated text for a response that carries no message of
 * its own; this is module scope, so it cannot reach the translator itself.
 */
async function loginWithToken(data: LoginInput, fallback: string): Promise<PublicUser> {
  const res = await fetch(api.auth.token.path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(api.auth.token.input.parse(data)),
  });
  if (!res.ok) throw await apiError(res, fallback);
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
      if (res.status === 401) {
        /*
          A restored token can already be dead: the server bumps `token_version` on a
          password change, which revokes every token issued before it. Without this,
          the dead token stays in the Keychain and is retried on every single launch,
          failing silently each time.

          Only cleared when one was actually held — on the web a 401 here is the normal
          answer for a signed-out visitor, and calling this unconditionally would be a
          no-op but a misleading one to read.
        */
        if (getAuthToken()) setAuthToken(null);
        return null;
      }
      if (!res.ok) throw new Error("Failed to load session");
      return (await res.json()) as PublicUser;
    },
    staleTime: 1000 * 60,
  });
}

export function useRegister() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: async (data: RegisterInput) => {
      const res = await fetch(api.auth.register.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.auth.register.input.parse(data)),
      });
      if (!res.ok) throw await apiError(res, t("toast.shared.generic"));
      const user = (await res.json()) as PublicUser;

      // Registration signs the user in via cookie, which the native shell cannot use;
      // exchange the same credentials for a token so the app is actually authenticated.
      if (isNativeApiMode()) {
        try {
          await loginWithToken({ email: data.email, password: data.password }, t("toast.shared.generic"));
        } catch {
          throw new RegisteredButNotSignedInError();
        }
      }
      return user;
    },
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user);
      toast({ title: t("toast.register.successTitle"), description: t("toast.register.successBody") });
    },
    onError: (err: Error) => {
      // The account may exist even though the mutation rejected; saying "Sign up
      // failed" there would send the user back into a retry that can only 409.
      const created = err instanceof RegisteredButNotSignedInError;
      toast({
        title: created ? t("toast.register.createdTitle") : t("toast.register.failedTitle"),
        description: created
          ? t("toast.register.createdBody")
          : errorText(err, {
              400: t("toast.shared.invalid"),
              409: t("toast.register.emailTaken"),
              429: t("toast.shared.rateLimited"),
            }),
        variant: created ? "default" : "destructive",
      });
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: async (data: LoginInput) => {
      if (isNativeApiMode()) return loginWithToken(data, t("toast.shared.generic"));

      const res = await fetch(api.auth.login.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.auth.login.input.parse(data)),
      });
      if (!res.ok) throw await apiError(res, t("toast.shared.generic"));
      return (await res.json()) as PublicUser;
    },
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user);
      // Interpolated, not concatenated: in Arabic the name sits before the greeting's
      // tail, and the dictionary is what decides where.
      toast({
        title: t("toast.login.successTitle"),
        description: t("toast.login.successBody", { name: firstName(user.name) }),
      });
    },
    onError: (err: Error) => {
      toast({
        title: t("toast.login.failedTitle"),
        description: errorText(err, {
          400: t("toast.shared.invalid"),
          401: t("toast.login.badCredentials"),
          429: t("toast.shared.rateLimited"),
        }),
        variant: "destructive",
      });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      /*
        Release the device's push token first, while this request can still authenticate.
        `POST /api/push/unregister` is behind `requireAuth`, and both credentials die in
        the next two steps: the logout request destroys the cookie session, and
        `clearSignedInState` drops the bearer token. Run after either and it 401s,
        leaving a `push_tokens` row still naming this user — so the next status change
        would deliver their booking details to whoever holds the phone next.

        `teardownPush` never rejects, so a failed release cannot block signing out.
      */
      await teardownPush();
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
  const { t } = useI18n();
  return useMutation({
    mutationFn: async (data: UpdateProfileInput) => {
      const res = await fetch(api.auth.updateProfile.path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.auth.updateProfile.input.parse(data)),
      });
      if (!res.ok) throw await apiError(res, t("toast.shared.generic"));
      return (await res.json()) as PublicUser;
    },
    onSuccess: (user) => {
      qc.setQueryData(ME_KEY, user);
      toast({ title: t("toast.profile.successTitle") });
    },
    onError: (err: Error) => {
      toast({
        title: t("toast.profile.failedTitle"),
        description: errorText(err, {
          400: t("toast.shared.invalid"),
          401: t("toast.shared.signedOut"),
        }),
        variant: "destructive",
      });
    },
  });
}

export function useForgotPassword() {
  const { toast } = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: async (data: { email: string }) => {
      const res = await fetch(api.auth.forgotPassword.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(api.auth.forgotPassword.input.parse(data)),
      });
      if (!res.ok) throw await apiError(res, t("toast.shared.generic"));
      return (await res.json()) as { ok: true; devToken?: string };
    },
    onError: (err: Error) => {
      toast({
        title: t("toast.forgotPassword.failedTitle"),
        description: errorText(err, {
          400: t("toast.shared.invalid"),
          429: t("toast.shared.rateLimited"),
        }),
        variant: "destructive",
      });
    },
  });
}

export function useResetPassword() {
  const { toast } = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: async (data: { token: string; newPassword: string }) => {
      const res = await fetch(api.auth.resetPassword.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(api.auth.resetPassword.input.parse(data)),
      });
      if (!res.ok) throw await apiError(res, t("toast.shared.generic"));
      return true;
    },
    onSuccess: () => {
      toast({ title: t("toast.resetPassword.successTitle"), description: t("toast.resetPassword.successBody") });
    },
    onError: (err: Error) => {
      toast({
        title: t("toast.resetPassword.failedTitle"),
        // 400 here is the dead-link case. The endpoint also 400s on a short new
        // password, but ResetPassword.tsx runs the same Zod rule before submitting,
        // so that branch cannot reach the network.
        description: errorText(err, {
          400: t("toast.resetPassword.badLink"),
          429: t("toast.shared.rateLimited"),
        }),
        variant: "destructive",
      });
    },
  });
}

export function useVerifyEmail() {
  const qc = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch(api.auth.verifyEmail.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.auth.verifyEmail.input.parse({ code })),
      });
      // No toast — VerifyEmail.tsx renders its own translated failure state.
      if (!res.ok) throw await apiError(res, t("toast.shared.generic"));
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
  const { t } = useI18n();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(api.auth.resendVerification.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw await apiError(res, t("toast.shared.generic"));
      return (await res.json()) as { ok: true; alreadyVerified?: boolean; devToken?: string };
    },
    onSuccess: (data) => {
      toast({
        title: data.alreadyVerified ? t("toast.verification.alreadyTitle") : t("toast.verification.sentTitle"),
        description: data.alreadyVerified
          ? t("toast.verification.alreadyBody")
          : t("toast.verification.sentBody"),
      });
    },
    onError: (err: Error) => {
      toast({
        title: t("toast.verification.failedTitle"),
        description: errorText(err, {
          401: t("toast.shared.signedOut"),
          429: t("toast.shared.rateLimited"),
        }),
        variant: "destructive",
      });
    },
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: async (data: ChangePasswordInput) => {
      const res = await fetch(api.auth.changePassword.path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.auth.changePassword.input.parse(data)),
      });
      if (!res.ok) throw await apiError(res, t("toast.shared.generic"));

      // The server revokes every bearer token for this user on a password change, the
      // one this app is holding included. Swap it for a fresh one; if that fails, drop
      // it so the app fails closed and prompts a sign-in rather than 401ing silently.
      if (isNativeApiMode()) {
        const me = qc.getQueryData<PublicUser | null>(ME_KEY);
        try {
          if (!me?.email) throw new Error("no cached user");
          await loginWithToken({ email: me.email, password: data.newPassword }, t("toast.shared.generic"));
        } catch {
          setAuthToken(null);
        }
      }
      return true;
    },
    onSuccess: () => {
      toast({ title: t("toast.changePassword.successTitle"), description: t("toast.changePassword.successBody") });
    },
    onError: (err: Error) => {
      toast({
        title: t("toast.changePassword.failedTitle"),
        // 400 here is the wrong-current-password case. The endpoint also 400s on a
        // short new password, but Profile.tsx validates against the same Zod schema
        // before submitting, so that branch cannot reach the network.
        description: errorText(err, {
          400: t("toast.changePassword.wrongCurrent"),
          401: t("toast.shared.signedOut"),
        }),
        variant: "destructive",
      });
    },
  });
}

/**
 * True when a delete failed because the password did not match.
 *
 * `DELETE /api/auth/account` answers a wrong password with 401 and a bare `{ message }` —
 * no `field` key, unlike `changePassword`'s 400. So the status is the only thing that
 * tells the caller to put the error on the password input rather than treat it as a
 * generic failure. This hook used to carry its own `DeleteAccountError` to preserve
 * that status; `ApiError` now does it for every request, so the class is gone and only
 * the domain question it answered remains.
 */
export function isWrongPassword(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: async (data: DeleteAccountInput) => {
      const res = await fetch(api.auth.deleteAccount.path, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(api.auth.deleteAccount.input.parse(data)),
      });
      // No toast — Profile.tsx raises it, because a 401 here also has to land on the
      // password field, which only the form can do.
      if (!res.ok) throw await apiError(res, t("toast.shared.generic"));
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
