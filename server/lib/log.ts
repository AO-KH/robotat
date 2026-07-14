import pino from "pino";
import { env } from "./env";

const isProd = env.NODE_ENV === "production";
const isTest = env.NODE_ENV === "test";

/**
 * Structured application logger.
 *   - production: newline-delimited JSON on stdout (ready for a log collector)
 *   - development: pretty, colorized lines via pino-pretty (a devDependency)
 *   - test: silent, to keep the test output clean
 * Override the threshold with LOG_LEVEL (e.g. "debug", "warn").
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? "info" : isTest ? "silent" : "debug"),
  transport:
    !isProd && !isTest
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:h:MM:ss TT", ignore: "pid,hostname" },
        }
      : undefined,
});

/**
 * Back-compat helper used across the server. Emits an info-level record with the
 * message and a `source` field (was the old `[source] message` console prefix).
 */
export function log(message: string, source = "express"): void {
  logger.info({ source }, message);
}
