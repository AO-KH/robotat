import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
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
    // Tests share one database and truncate between cases — run files serially.
    fileParallelism: false,
    // Forward the test DB config into the worker processes.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "test-secret",
    },
    /*
      Two projects because the two kinds of test want different worlds, and the cost of
      giving every file the union of both is measurable rather than theoretical.

      The `server` project is what this suite has always been: node, no DOM. The
      `components` project is jsdom, and only it pays for jsdom and for loading
      @testing-library — both are scoped here rather than switched on globally.
      Measured on the 24 pre-existing files: hanging the DOM setup file off the shared
      `setupFiles` took the suite from 35.8s to 41.1s (per-file setup 183ms -> 6.10s)
      and bought those files nothing, since not one of them renders anything.

      `projects` rather than `environmentMatchGlobs`: that option was removed in Vitest 4
      (this repo is on 4.1.10) and no longer exists at any level of the config. A
      per-file `// @vitest-environment jsdom` docblock does still work here — verified —
      but it only switches the environment, leaving the setup file to be imported by hand
      in every component test, so a file that forgot it would fail confusingly rather
      than not compile. `projects` is the one mechanism that scopes the environment and
      the setup together.
    */
    projects: [
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["test/**/*.test.ts"],
          exclude: ["test/components/**"],
          setupFiles: ["test/setup.ts"],
        },
      },
      {
        // The app's JSX is compiled by @vitejs/plugin-react, not by esbuild's own
        // handling: tsconfig sets `jsx: "preserve"`, so without this plugin the JSX in
        // a component test reaches the runtime untransformed.
        extends: true,
        plugins: [react()],
        test: {
          name: "components",
          environment: "jsdom",
          include: ["test/components/**/*.test.{ts,tsx}"],
          setupFiles: ["test/setup.ts", "test/components/setup-dom.ts"],
        },
      },
    ],
  },
});
