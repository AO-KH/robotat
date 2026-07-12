import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
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
  createdAt: timestamp("created_at").defaultNow(),
});

export type User = typeof users.$inferSelect;

/** Public-safe user shape (never expose the password hash). */
export type PublicUser = Pick<User, "id" | "name" | "email" | "role" | "createdAt">;

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
 * Demo requests (legacy public lead-capture — still supported)
 * ========================================================== */
export const demoRequests = pgTable("demo_requests", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  message: text("message"),
  landSize: text("land_size"),
  location: text("location"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDemoRequestSchema = createInsertSchema(demoRequests).omit({
  id: true,
  createdAt: true,
});

export type InsertDemoRequest = z.infer<typeof insertDemoRequestSchema>;
export type DemoRequest = typeof demoRequests.$inferSelect;
