import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, User as UserIcon, Lock } from "lucide-react";
import {
  updateProfileSchema,
  changePasswordSchema,
  type UpdateProfileInput,
  type ChangePasswordInput,
} from "@shared/schema";
import { useCurrentUser, useUpdateProfile, useChangePassword } from "@/features/auth/use-auth";
import { useSeo } from "@/lib/seo";

const inputClass =
  "w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  useSeo({ title: "Account settings", noindex: true });

  useEffect(() => {
    if (!isLoading && !user) setLocation("/auth");
  }, [isLoading, user, setLocation]);

  const profileForm = useForm<UpdateProfileInput>({ resolver: zodResolver(updateProfileSchema) });
  const passwordForm = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

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
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>

        <h1 className="text-3xl font-bold mb-8">Account settings</h1>

        {/* Profile */}
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-3xl border border-white/10 p-6 md:p-8 mb-6">
          <div className="flex items-center gap-2 mb-5">
            <UserIcon className="w-5 h-5 text-[#c084fc]" />
            <h2 className="text-xl font-semibold">Profile</h2>
          </div>

          <form onSubmit={profileForm.handleSubmit((d) => updateProfile.mutate(d))} className="space-y-4" noValidate>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Email</label>
              <input value={user.email} disabled className={`${inputClass} opacity-60 cursor-not-allowed`} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Full name</label>
              <input className={inputClass} {...profileForm.register("name")} />
              {profileForm.formState.errors.name && (
                <p className="text-xs text-destructive">{profileForm.formState.errors.name.message}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-medium hover:bg-[#a855f7] transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save changes"}
            </button>
          </form>
        </motion.section>

        {/* Password */}
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card rounded-3xl border border-white/10 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-5">
            <Lock className="w-5 h-5 text-[#c084fc]" />
            <h2 className="text-xl font-semibold">Change password</h2>
          </div>

          <form
            onSubmit={passwordForm.handleSubmit((d) =>
              changePassword.mutate(d, { onSuccess: () => passwordForm.reset() }),
            )}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Current password</label>
              <input type="password" className={inputClass} {...passwordForm.register("currentPassword")} />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-xs text-destructive">{passwordForm.formState.errors.currentPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">New password</label>
              <input type="password" placeholder="At least 8 characters" className={inputClass} {...passwordForm.register("newPassword")} />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-xs text-destructive">{passwordForm.formState.errors.newPassword.message}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={changePassword.isPending}
              className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-medium hover:bg-[#a855f7] transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {changePassword.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update password"}
            </button>
          </form>
        </motion.section>
      </div>
    </div>
  );
}
