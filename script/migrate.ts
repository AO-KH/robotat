import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Production migration runner. Unlike `npm run db:migrate` (drizzle-kit, a
// devDependency), this uses drizzle-orm's own migrator — a runtime dependency —
// so it works from the slim production image, which ships only dist/ + migrations/.
// It needs nothing but DATABASE_URL (no SESSION_SECRET / SMTP validation).

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required to run migrations");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool);

  console.log("applying migrations...");
  await migrate(db, { migrationsFolder: "migrations" });
  console.log("migrations applied successfully");

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
