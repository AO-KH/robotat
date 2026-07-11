import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";

// Load the test database URL (and other test env) before the config is used.
dotenv.config({ path: ".env.test" });

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client", "src"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // Tests share one database and truncate between cases — run files serially.
    fileParallelism: false,
    // Forward the test DB config into the worker processes.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "test-secret",
    },
  },
});
