import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, User as UserIcon, Lock, AlertTriangle } from "lucide-react";
import {
  updateProfileSchema,
  changePasswordSchema,
  deleteAccountSchema,
  type UpdateProfileInput,
  type ChangePasswordInput,
  type DeleteAccountInput,
} from "@shared/schema";
import {
  useCurrentUser,
  useUpdateProfile,
  useChangePassword,
  useDeleteAccount,
  isWrongPassword,
} from "@/features/auth/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n";
import { useSeo } from "@/lib/seo";
import { riseOnMount } from "@/lib/motion";

const inputClass =
  "w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const deleteAccount = useDeleteAccount();
  const { toast } = useToast();
  const { t } = useI18n();
  useSeo({ title: "Account settings", noindex: true });

  useEffect(() => {
    if (!isLoading && !user) setLocation("/auth");
  }, [isLoading, user, setLocation]);

  const profileForm = useForm<UpdateProfileInput>({ resolver: zodResolver(updateProfileSchema) });
  const passwordForm = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });
  const deleteForm = useForm<DeleteAccountInput>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { password: "" },
  });
  // Watched so the confirm button stays disabled until something is typed — the guard
  // against a stray click on an unlocked device, before the password check runs at all.
  const deletePassword = deleteForm.watch("password");

  // Prefill the name once the user loads.
  useEffect(() => {
    if (user) profileForm.reset({ name: user.name });
  }, [user, profileForm]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-28 pb-28 md:pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-body text-muted-foreground hover:text-foreground mb-6 transition-colors min-h-[44px]">
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("profile.backToDashboard")}
        </Link>

        <h1 className="text-heading font-semibold mb-8">{t("profile.accountSettings")}</h1>

        {/* Profile */}
        <motion.section {...riseOnMount} className="surface rounded-3xl p-6 md:p-8 mb-6">
          <div className="flex items-center gap-2 mb-5">
            <UserIcon className="w-5 h-5 text-[#c084fc]" />
            <h2 className="text-subhead font-semibold">{t("profile.profile")}</h2>
          </div>

          <form onSubmit={profileForm.handleSubmit((d) => updateProfile.mutate(d))} className="space-y-4" noValidate>
            <div className="space-y-2">
              <label className="text-body font-semibold text-foreground/80">{t("profile.email")}</label>
              <input value={user.email} disabled className={`${inputClass} opacity-60 cursor-not-allowed`} />
            </div>
            <div className="space-y-2">
              <label className="text-body font-semibold text-foreground/80">{t("profile.fullName")}</label>
              <input className={inputClass} {...profileForm.register("name")} />
              {profileForm.formState.errors.name && (
                <p className="text-label text-destructive">{profileForm.formState.errors.name.message}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-body font-semibold hover:bg-[#a855f7] transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("profile.saveChanges")}
            </button>
          </form>
        </motion.section>

        {/* Password */}
        <motion.section {...riseOnMount} transition={{ ...riseOnMount.transition, delay: 0.05 }} className="surface rounded-3xl p-6 md:p-8 mb-6">
          <div className="flex items-center gap-2 mb-5">
            <Lock className="w-5 h-5 text-[#c084fc]" />
            <h2 className="text-subhead font-semibold">{t("profile.changePassword")}</h2>
          </div>

          <form
            onSubmit={passwordForm.handleSubmit((d) =>
              changePassword.mutate(d, { onSuccess: () => passwordForm.reset() }),
            )}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <label className="text-body font-semibold text-foreground/80">{t("profile.currentPassword")}</label>
              <input type="password" className={inputClass} {...passwordForm.register("currentPassword")} />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-label text-destructive">{passwordForm.formState.errors.currentPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-body font-semibold text-foreground/80">{t("profile.newPassword")}</label>
              <input type="password" placeholder={t("profile.newPasswordHint")} className={inputClass} {...passwordForm.register("newPassword")} />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-label text-destructive">{passwordForm.formState.errors.newPassword.message}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={changePassword.isPending}
              className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-body font-semibold hover:bg-[#a855f7] transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {changePassword.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("profile.updatePassword")}
            </button>
          </form>
        </motion.section>

        {/* Delete account — Apple guideline 5.1.1(v) requires this to be reachable in-app. */}
        <motion.section
          {...riseOnMount}
          transition={{ ...riseOnMount.transition, delay: 0.1 }}
          className="surface rounded-3xl p-6 md:p-8 border-destructive/40"
        >
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h2 className="text-subhead font-semibold">{t("profile.deleteTitle")}</h2>
          </div>

          <p className="text-body text-foreground/80 mb-3">{t("profile.deleteBody")}</p>
          {/* Deleting a row does not reach into anyone's inbox: every booking was already
              sent on to the team by WhatsApp and email. Saying so is the honest version. */}
          <p className="text-label text-muted-foreground mb-5">{t("profile.deleteBookingsNote")}</p>

          <form
            onSubmit={deleteForm.handleSubmit((d) =>
              deleteAccount.mutate(d, {
                onSuccess: () => setLocation("/"),
                onError: (err) => {
                  // 401 here means the password, not the session — the endpoint returns a
                  // bare { message }, so the status is what puts the error on the field.
                  const wrong = isWrongPassword(err);
                  if (wrong) {
                    deleteForm.setError("password", { message: t("profile.deleteWrongPassword") });
                  }
                  toast({
                    title: t("profile.deleteFailed"),
                    description: wrong ? t("profile.deleteWrongPassword") : err.message,
                    variant: "destructive",
                  });
                },
              }),
            )}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <label htmlFor="delete-password" className="block text-body font-semibold text-foreground/80">
                {t("profile.deletePasswordLabel")}
              </label>
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                className={`${inputClass} min-h-[44px]`}
                aria-invalid={deleteForm.formState.errors.password ? true : undefined}
                aria-describedby={deleteForm.formState.errors.password ? "delete-password-error" : undefined}
                {...deleteForm.register("password")}
              />
              {deleteForm.formState.errors.password && (
                <p id="delete-password-error" role="alert" className="text-label text-destructive">
                  {deleteForm.formState.errors.password.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={!deletePassword || deleteAccount.isPending}
              className="min-h-[44px] px-6 py-2.5 rounded-full border border-destructive text-destructive text-body font-semibold hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-destructive inline-flex items-center justify-center gap-2"
            >
              {deleteAccount.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("profile.deleteConfirm")}
            </button>
          </form>
        </motion.section>
      </div>
    </div>
  );
}
