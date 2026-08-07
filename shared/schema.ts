import { pgTable, text, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { z } from "zod";

/** User roles. `customer` is the default; `staff` can access the admin module. */
export const USER_ROLES = ["customer", "staff"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/* ============================================================
 * Users
 * ========================================================== */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  /**
   * The address with provider-specific aliasing stripped — see canonicalEmail().
   * Uniquely indexed, so one mailbox cannot hold several accounts. `email` keeps
   * whatever the customer typed, because that is what they recognise.
   */
  emailCanonical: text("email_canonical").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("customer"),
  // Null until the user confirms their email with the 6-digit code they were sent.
  emailVerifiedAt: timestamp("email_verified_at"),
  // Embedded as a claim in bearer tokens and checked on every bearer request.
  // Bumping it revokes every token previously issued to this user — the only way
  // to evict a stolen token, since the tokens themselves are stateless.
  tokenVersion: integer("token_version").notNull().default(0),
  // Language for account mail (password reset, email verification). Those have no
  // assessment to read a language off, so the user row is the only source.
  locale: text("locale").notNull().default("en"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type User = typeof users.$inferSelect;

/** Public-safe user shape (never expose the password hash). */
export type PublicUser = Pick<User, "id" | "name" | "email" | "role" | "createdAt"> & {
  emailVerified: boolean;
};

/**
 * A registered account as the staff user list shows it.
 *
 * Built on PublicUser rather than on User, so the password hash is excluded by the type
 * and not merely by remembering to leave it out. `locale` is included because it decides
 * which language every message to this person is written in, which is the sort of thing
 * staff need to see when a customer says they were written to in the wrong one.
 */
export type AdminUserSummary = PublicUser & {
  locale: string;
  bookingCount: number;
  lastBookingAt: Date | null;
};

/* ============================================================
 * Auth tokens — single-use, hashed tokens for password reset
 * and email verification (the raw token is emailed, never stored).
 * ========================================================== */
export const AUTH_TOKEN_KINDS = ["password_reset", "email_verification"] as const;
export type AuthTokenKind = (typeof AUTH_TOKEN_KINDS)[number];

export const authTokens = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // AuthTokenKind
  tokenHash: text("token_hash").notNull(), // sha256 of the raw token
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"), // null until redeemed; enforces single use
  // Wrong guesses so far. A 6-digit verification code needs this; a 32-byte reset
  // token does not, but sharing one table is simpler than splitting it for one column.
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AuthToken = typeof authTokens.$inferSelect;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * The 6-digit code emailed after registration.
 *
 * Trimmed and stripped of spaces before validating: people paste "123 456" out of an
 * email, and rejecting that as malformed teaches them nothing about what was wrong.
 */
export const verifyEmailSchema = z.object({
  code: z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email")),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/**
 * The languages ROBOTAT can write to a customer in.
 *
 * Optional on every input that carries it, and defaulted server-side rather than here:
 * an older client — a shipped iOS build that predates this field — must keep working,
 * and it should get the English it has always got rather than a 400.
 */
export const localeSchema = z.enum(["en", "ar"]);
export type Locale = z.infer<typeof localeSchema>;

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  locale: localeSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name"),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Deleting an account re-verifies the password: it is irreversible, and session-only
 *  proof is not enough if someone walks up to an unlocked device. */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

/* ============================================================
 * Assessment bookings (a logged-in user requests a site visit)
 * ========================================================== */
/** Assessment lifecycle. Staff move a booking through these via the admin module. */
export const ASSESSMENT_STATUSES = ["pending", "scheduled", "completed", "cancelled"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const assessments = pgTable("assessments", {
  id: serial("id").primaryKey(),
  // Nullable on purpose: deleting an account detaches its bookings instead of
  // destroying them (App Store Guideline 5.1.1(v)). An assessment records a site
  // visit ROBOTAT actually performed — a business fact that outlives the account.
  // The contact fields below are anonymised at deletion time.
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  landSize: text("land_size"),
  location: text("location"),
  message: text("message"),
  status: text("status").notNull().default("pending"),
  // Copied from the booker at insert time, not read back through userId. A booking
  // made in Arabic stays Arabic even if the account later switches language, and a
  // detached row (userId null after account deletion) still knows how to address its
  // remaining status updates.
  locale: text("locale").notNull().default("en"),
  scheduledAt: timestamp("scheduled_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Assessment = typeof assessments.$inferSelect;

/** Staff update: change status and optionally set/clear the scheduled visit date. */
export const updateAssessmentSchema = z.object({
  status: z.enum(ASSESSMENT_STATUSES),
  scheduledAt: z.string().datetime().nullable().optional(),
});
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;

/** Fields the client sends when booking (userId + status are set server-side). */
export const bookAssessmentSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name"),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z.string().trim().optional(),
  company: z.string().trim().optional(),
  landSize: z.string().trim().optional(),
  location: z.string().trim().optional(),
  message: z.string().trim().optional(),
  locale: localeSchema.optional(),
});
export type BookAssessmentInput = z.infer<typeof bookAssessmentSchema>;

/**
 * How many site assessments one account may book per rolling 24 hours.
 *
 * A site assessment sends an agronomist to a farm, so the ceiling is about protecting
 * a real-world diary, not about server load. Three is generous for anyone booking
 * honestly — a farm with several sites can still raise three a day, every day — while
 * a stuck submit button or a script cannot bury the team in work that has to be read
 * and dismissed by hand.
 *
 * Rolling 24 hours rather than a calendar day, for two reasons. There is no timezone
 * to argue about: a calendar day would reset at 03:00 in Riyadh if the server counted
 * in UTC. And it cannot be sidestepped by booking three at 23:59 and three more a
 * minute later.
 *
 * Shared so the server enforces this number and the client's message quotes it. Kept
 * in one place because two copies drift, and the copy is the half nobody remembers.
 */
export const DAILY_ASSESSMENT_LIMIT = 3;

/* ============================================================
 * Push tokens — device tokens for native notifications (APNs)
 * ========================================================== */
/** Platforms a device token can come from. Only iOS ships today. */
export const PUSH_PLATFORMS = ["ios", "android", "web"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/**
 * One row per device, keyed by the token itself.
 *
 * `token` is UNIQUE rather than (user_id, token): a phone can be handed to another
 * person who signs in with their own account, and the same device token must then
 * belong to the new user instead of existing twice. Registration upserts on the
 * token and reassigns `user_id`.
 *
 * The cascade is load-bearing. Deleting an account (deleteAccountAndAnonymise)
 * detaches bookings and analytics but knows nothing about push; without ON DELETE
 * CASCADE a deleted user's device would keep a row pointing at a missing user, and
 * the fan-out would eventually try to notify it.
 */
export const pushTokens = pgTable(
  "push_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    platform: text("platform").notNull().default("ios"), // PushPlatform
    createdAt: timestamp("created_at").defaultNow(),
    // Bumped on every re-registration; the app re-registers on each launch, so a
    // stale last_seen_at is how dead devices will be spotted later.
    lastSeenAt: timestamp("last_seen_at").defaultNow(),
  },
  (table) => [index("push_tokens_user_id_idx").on(table.userId)],
);

export type PushToken = typeof pushTokens.$inferSelect;

/** A device token is opaque (APNs sends hex today) — check it is a plausible
 *  non-empty string rather than inventing a format the platform never promised. */
const deviceTokenSchema = z
  .string()
  .trim()
  .min(1, "Device token is required")
  .max(512, "Device token is too long");

export const registerPushTokenSchema = z.object({
  token: deviceTokenSchema,
  platform: z.enum(PUSH_PLATFORMS).optional(),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const unregisterPushTokenSchema = z.object({
  token: deviceTokenSchema,
});
export type UnregisterPushTokenInput = z.infer<typeof unregisterPushTokenSchema>;

/* ============================================================
 * Analytics — first-party, anonymous event stream
 * ========================================================== */
export const analyticsEvents = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // e.g. page_view, booking_open, booking_whatsapp…
  path: text("path"),
  visitorId: text("visitor_id"), // anonymous, client-generated (no PII, no IP stored)
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;

/** What the client sends when recording an event. */
export const trackEventSchema = z.object({
  type: z.string().trim().min(1).max(64),
  path: z.string().max(512).optional(),
  visitorId: z.string().max(64).optional(),
});
export type TrackEventInput = z.infer<typeof trackEventSchema>;

/* ============================================================
 * Products (fleet content — editable in the DB, bilingual)
 * ========================================================== */
export interface ProductSpec {
  labelEn: string;
  labelAr: string;
  valueEn: string;
  valueAr: string;
}

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  kind: text("kind").notNull(), // 'platform' | 'attachment'
  sortOrder: integer("sort_order").notNull().default(0),
  name: text("name").notNull(), // brand name, not translated (e.g. "MAX T100")
  roleEn: text("role_en").notNull(),
  roleAr: text("role_ar").notNull(),
  descriptionEn: text("description_en").notNull(),
  descriptionAr: text("description_ar").notNull(),
  specs: jsonb("specs").$type<ProductSpec[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Product = typeof products.$inferSelect;

export interface AnalyticsSummary {
  totalPageViews: number;
  uniqueVisitors: number;
  topPaths: { path: string; views: number }[];
  funnel: { opened: number; whatsapp: number; email: number; submitted: number };
}
