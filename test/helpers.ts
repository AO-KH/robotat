import type { Express } from "express";
import { buildApp } from "../server/app";
import { pool } from "../server/lib/db";

let cachedApp: Express | undefined;

/** Build (once) and return the Express app for supertest. */
export async function getApp(): Promise<Express> {
  if (!cachedApp) {
    const { app } = await buildApp();
    cachedApp = app;
  }
  return cachedApp;
}

/** Wipe all data between tests. `user_sessions` is created lazily by the session store. */
export async function resetDb(): Promise<void> {
  await pool.query(
    `DO $$ BEGIN IF to_regclass('public.user_sessions') IS NOT NULL THEN TRUNCATE user_sessions; END IF; END $$;`,
  );
  await pool.query("TRUNCATE users, assessments, demo_requests RESTART IDENTITY CASCADE");
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

/** A valid registration payload with a unique-ish email. */
export function newUser(overrides: Partial<{ name: string; email: string; password: string }> = {}) {
  return {
    name: "Test User",
    email: "test.user@example.com",
    password: "password123",
    ...overrides,
  };
}
