import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

/**
 * The native iOS build bakes VITE_API_URL into the bundle. iOS App Transport Security
 * blocks plaintext HTTP on a real device, and the failure surfaces as a generic
 * network error — login just reports "Could not sign in", with nothing pointing at a
 * mis-set build variable. That is invisible in CI and in the simulator, so it would
 * only appear during TestFlight. Fail the build instead.
 */
function assertApiUrlIsHttps(): void {
  const url = process.env.VITE_API_URL;
  if (!url) return; // unset is correct for the web build — the client is same-origin
  if (!url.startsWith("https://")) {
    throw new Error(
      `VITE_API_URL must use https:// — got "${url}". iOS App Transport Security ` +
        `blocks plaintext HTTP, so a native build against this origin would fail on ` +
        `device with an opaque network error.`,
    );
  }
}

async function buildAll() {
  assertApiUrlIsHttps();

  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  const shared = {
    platform: "node" as const,
    bundle: true,
    format: "cjs" as const,
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info" as const,
  };

  await esbuild({
    ...shared,
    entryPoints: ["server/index.ts"],
    outfile: "dist/index.cjs",
  });

  // Standalone production migration runner (see script/migrate.ts).
  await esbuild({
    ...shared,
    entryPoints: ["script/migrate.ts"],
    outfile: "dist/migrate.cjs",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
