import { z } from "zod";
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  bookAssessmentSchema,
  updateAssessmentSchema,
  ASSESSMENT_STATUSES,
  assessments,
  trackEventSchema,
  type PublicUser,
  type Assessment,
  type AnalyticsSummary,
  type Product,
} from "./schema";

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  unauthorized: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
};

const publicUserSchema = z.custom<PublicUser>();
const assessmentSchema = z.custom<typeof assessments.$inferSelect>();

export const api = {
  auth: {
    register: {
      method: "POST" as const,
      path: "/api/auth/register" as const,
      input: registerSchema,
      responses: {
        201: publicUserSchema,
        400: errorSchemas.validation,
        409: errorSchemas.validation,
      },
    },
    login: {
      method: "POST" as const,
      path: "/api/auth/login" as const,
      input: loginSchema,
      responses: {
        200: publicUserSchema,
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: "POST" as const,
      path: "/api/auth/logout" as const,
      input: z.object({}),
      responses: { 200: z.object({ ok: z.literal(true) }) },
    },
    me: {
      method: "GET" as const,
      path: "/api/auth/me" as const,
      responses: {
        200: publicUserSchema,
        401: errorSchemas.unauthorized,
      },
    },
    updateProfile: {
      method: "PATCH" as const,
      path: "/api/auth/profile" as const,
      input: updateProfileSchema,
      responses: {
        200: publicUserSchema,
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    changePassword: {
      method: "PATCH" as const,
      path: "/api/auth/password" as const,
      input: changePasswordSchema,
      responses: {
        200: z.object({ ok: z.literal(true) }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
  },
  assessments: {
    create: {
      method: "POST" as const,
      path: "/api/assessments" as const,
      input: bookAssessmentSchema,
      responses: {
        201: z.object({
          assessment: assessmentSchema,
          whatsappUrl: z.string(),
          mailtoUrl: z.string(),
        }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    list: {
      method: "GET" as const,
      path: "/api/assessments" as const,
      responses: {
        200: z.array(assessmentSchema),
        401: errorSchemas.unauthorized,
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/assessments/:id" as const,
      responses: {
        200: assessmentSchema,
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
  },
  admin: {
    // Staff-only. List every booking, optionally filtered by status.
    listAssessments: {
      method: "GET" as const,
      path: "/api/admin/assessments" as const,
      query: z.object({ status: z.enum(ASSESSMENT_STATUSES).optional() }),
      responses: {
        200: z.array(assessmentSchema),
        401: errorSchemas.unauthorized,
        403: errorSchemas.unauthorized,
      },
    },
    // Staff-only. Change a booking's status (and optionally its scheduled date).
    updateAssessment: {
      method: "PATCH" as const,
      path: "/api/admin/assessments/:id" as const,
      input: updateAssessmentSchema,
      responses: {
        200: assessmentSchema,
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
        403: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
    // Staff-only. Aggregate analytics (page views, unique visitors, booking funnel).
    analytics: {
      method: "GET" as const,
      path: "/api/admin/analytics" as const,
      responses: {
        200: z.custom<AnalyticsSummary>(),
        401: errorSchemas.unauthorized,
        403: errorSchemas.unauthorized,
      },
    },
  },
  products: {
    // Public — the fleet catalogue, served from the database.
    list: {
      method: "GET" as const,
      path: "/api/products" as const,
      responses: { 200: z.array(z.custom<Product>()) },
    },
  },
  analytics: {
    // Public, fire-and-forget event ingest.
    track: {
      method: "POST" as const,
      path: "/api/analytics/events" as const,
      input: trackEventSchema,
      responses: {
        202: z.object({ ok: z.literal(true) }),
        400: errorSchemas.validation,
      },
    },
  },
  contact: {
    get: {
      method: "GET" as const,
      path: "/api/contact" as const,
      responses: {
        200: z.object({ whatsappUrl: z.string(), mailtoUrl: z.string() }),
      },
    },
    submit: {
      method: "POST" as const,
      path: "/api/contact" as const,
      input: bookAssessmentSchema,
      responses: {
        200: z.object({ whatsappUrl: z.string(), mailtoUrl: z.string() }),
        400: errorSchemas.validation,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type RegisterInput = z.infer<typeof api.auth.register.input>;
export type LoginInput = z.infer<typeof api.auth.login.input>;
export type BookAssessmentInput = z.infer<typeof api.assessments.create.input>;
export type AssessmentResponse = Assessment;
