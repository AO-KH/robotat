import express, { type Express, type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { createServer, type Server } from "http";
import { registerRoutes } from "./routes";
import { logger } from "./lib/log";
import { env } from "./lib/env";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const isProd = env.NODE_ENV === "production";

/**
 * Build the Express app with all middleware, routes, and the error handler wired,
 * but WITHOUT the Vite/static host or the HTTP listener. `index.ts` adds those for
 * running the server; integration tests mount the returned `app` directly.
 */
export async function buildApp(): Promise<{ app: Express; httpServer: Server }> {
  const app = express();
  const httpServer = createServer(app);

  // Security headers. Strict CSP + frame/cross-origin protections are production-only —
  // in dev they would break Vite's inline scripts, HMR websocket, and the local preview.
  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? {
            useDefaults: true,
            directives: {
              "script-src": ["'self'"],
              "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              "font-src": ["'self'", "https://fonts.gstatic.com"],
              "img-src": ["'self'", "data:", "https:"],
              "connect-src": ["'self'"],
            },
          }
        : false,
      frameguard: isProd,
      crossOriginOpenerPolicy: isProd,
      crossOriginResourcePolicy: isProd,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));

  // Structured per-request logging for /api routes. Response bodies are NOT logged
  // (they carry PII — emails — and secrets like dev/reset tokens); only metadata.
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;
      const durationMs = Date.now() - start;
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      logger[level](
        { source: "api", method: req.method, path, status: res.statusCode, durationMs },
        `${req.method} ${path} ${res.statusCode} ${durationMs}ms`,
      );
    });

    next();
  });

  await registerRoutes(httpServer, app);

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logger.error({ err, status, method: req.method, path: req.path }, "unhandled request error");

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  return { app, httpServer };
}
