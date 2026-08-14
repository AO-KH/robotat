-- The session table, which until now was never created by anything that survives a build.
--
-- express-session's Postgres store was configured with `createTableIfMissing: true`, so
-- the table appeared the first time a session was written. That works under tsx, and only
-- under tsx. connect-pg-simple creates it by reading a data file out of its own package:
--
--   fs.readFile(path.resolve(__dirname, './table.sql'))   -- connect-pg-simple/index.js:183
--
-- script/build.ts bundles the server into dist/index.cjs with esbuild, which rewrites
-- __dirname to the location of the bundle. In the shipped image that resolves to
-- /app/dist/table.sql, a path that has never existed, and the read throws ENOENT — on the
-- first request that tries to persist a session, which is to say on the first sign-in.
-- Every deployment of the built artifact has had a web login that cannot work, while dev
-- and the test suite were fine, because both run from source.
--
-- Creating it here removes the runtime file read entirely (the store is now configured
-- with createTableIfMissing: false), and takes CREATE TABLE off the list of rights the
-- application needs while serving traffic. A database that is missing this table now says
-- so as a plain missing relation instead of as a filesystem error naming a package
-- internal.
--
-- The DDL is connect-pg-simple's own, with the substitution it performs applied by hand:
-- it does `replaceAll('"session"', quotedTable)`, which renames the table and leaves the
-- constraint and index names alone. Reproduced exactly, including `session_pkey`, so that
-- a database created the old way and one created by this migration are indistinguishable
-- — and so re-enabling createTableIfMissing later could not collide with what is here.
--
-- IF NOT EXISTS throughout: databases that already ran the app under tsx have this table
-- already, and this migration must be a no-op there rather than a failure.

CREATE TABLE IF NOT EXISTS "user_sessions" (
	"sid" varchar NOT NULL COLLATE "default",
	"sess" json NOT NULL,
	"expire" timestamp(6) NOT NULL,
	CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
