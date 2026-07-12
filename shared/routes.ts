import { z } from "zod";
import {
  insertDemoRequestSchema,
  demoRequests,
  registerSchema,
  loginSchema,
  bookAssessmentSchema,
  updateAssessmentSchema,
  ASSESSMENT_STATUSES,
  assessments,
  type PublicUser,
  type Assessment,
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
  demoRequests: {
    create: {
      method: "POST" as const,
      path: "/api/demo-requests" as const,
      input: insertDemoRequestSchema,
      responses: {
        201: z.custom<typeof demoRequests.$inferSelect>(),
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
export type DemoRequestInput = z.infer<typeof api.demoRequests.create.input>;
export type DemoRequestResponse = z.infer<typeof api.demoRequests.create.responses[201]>;
