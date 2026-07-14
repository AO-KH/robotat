import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
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
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("customer"),
  // Null until the user confirms their email via a verification link.
  emailVerifiedAt: timestamp("email_verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type User = typeof users.$inferSelect;

/** Public-safe user shape (never expose the password hash). */
export type PublicUser = Pick<User, "id" | "name" | "email" | "role" | "createdAt"> & {
  emailVerified: boolean;
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

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
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

/* ============================================================
 * Assessment bookings (a logged-in user requests a site visit)
 * ========================================================== */
/** Assessment lifecycle. Staff move a booking through these via the admin module. */
export const ASSESSMENT_STATUSES = ["pending", "scheduled", "completed", "cancelled"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const assessments = pgTable("assessments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  landSize: text("land_size"),
  location: text("location"),
  message: text("message"),
  status: text("status").notNull().default("pending"),
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
});
export type BookAssessmentInput = z.infer<typeof bookAssessmentSchema>;

/* ============================================================
 * Analytics — first-party, anonymous event stream
 * ========================================================== */
export const analyticsEvents = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // e.g. page_view, booking_open, booking_whatsapp…
  path: text("path"),
  visitorId: text("visitor_id"), // anonymous, client-generated (no PII, no IP stored)
  userId: integer("user_id").references(() => users.id),
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
