-- Move the database-clock timestamps to `timestamptz`, so a stored value names an
-- instant instead of a wall clock nobody records the zone of.
--
-- ## The defect
--
-- Every column below is filled by `now()`. `now()` returns `timestamptz`; storing it
-- into a `timestamp without time zone` column converts it using the DATABASE SESSION's
-- TimeZone and throws the zone away, so the column holds local wall clock. Drizzle then
-- reads it back as `new Date(value + "+0000")` (pg-core/columns/timestamp.js) — it has
-- no zone to work from, so it assumes UTC. The two halves disagree by exactly the
-- database's UTC offset. On the machine this was found on (`TimeZone = Asia/Riyadh`,
-- from postgresql.conf), a booking made at 18:30 came back through the admin API as
-- 18:30Z: three hours in the future.
--
-- It is a class, not an incident. The same mismatch already produced a "24-hour"
-- booking window that was really 27 hours; that was fixed by keeping both sides of the
-- comparison inside SQL, which is correct but only immunises the one comparison.
-- Anything that reads one of these columns out into JavaScript inherits the offset, and
-- five surfaces did: the customer dashboard's request date, the assessment detail page,
-- the admin bookings list, the admin Users tab's "joined", and its `lastBookingAt`.
-- `timestamptz` is the frame in which the mistake cannot be made.
--
-- ## Why this conversion does not move any real data
--
-- `ALTER COLUMN … TYPE timestamptz` interprets each existing value in the session's
-- TimeZone. That is the dangerous part of this migration and the reason it is spelled
-- out with an explicit USING clause rather than left to the implicit default: a
-- conversion under the wrong zone silently rewrites every historical row to an instant
-- that never happened, which is far worse than the display bug being fixed.
--
-- It is safe here because it is the inverse of the write. These values were produced by
-- `now()` being cast down to `timestamp` using the session TimeZone; reading them back
-- `AT TIME ZONE current_setting('TimeZone')` applies exactly that cast in reverse. The
-- conversion is correct for whatever the deployment's zone happens to be — Riyadh here,
-- UTC on most managed Postgres — because the same setting governed both directions. It
-- would only be wrong on a database whose TimeZone was CHANGED between when rows were
-- written and now. If that has happened, stop and work out which rows predate the
-- change; do not run this.
--
-- Asia/Riyadh has no DST, so no value here sits in a gap or an ambiguous repeated hour.
-- A deployment in a DST zone should check that before running this.
--
-- ## What is deliberately left as plain `timestamp`
--
-- Only the columns the DATABASE clock fills are converted. The ones the APPLICATION
-- fills — `assessments.scheduled_at`, `auth_tokens.expires_at`, `users.email_verified_at`,
-- `auth_tokens.used_at` — are written by Drizzle as `value.toISOString()` and read back
-- as UTC, so they already round-trip to the same instant and have no bug to fix.
-- Converting them would need `AT TIME ZONE 'UTC'` instead, and for `used_at` there is no
-- single right answer at all: it is written by `new Date()` in one place and by
-- `sql\`now()\`` in two others, so its existing rows are a mix of both frames and no
-- USING clause can be correct for all of them. It is only ever tested for NULL, so it
-- costs nothing to leave. See the note in shared/schema.ts.
--
-- ## Locking
--
-- Each ALTER rewrites its table under ACCESS EXCLUSIVE. These tables are small (bookings
-- and accounts for one business), so this is a moment; on a table of a different order
-- it would not be.

ALTER TABLE "users" ALTER COLUMN "created_at" TYPE timestamp with time zone
  USING "created_at" AT TIME ZONE current_setting('TimeZone');

ALTER TABLE "auth_tokens" ALTER COLUMN "created_at" TYPE timestamp with time zone
  USING "created_at" AT TIME ZONE current_setting('TimeZone');

ALTER TABLE "assessments" ALTER COLUMN "created_at" TYPE timestamp with time zone
  USING "created_at" AT TIME ZONE current_setting('TimeZone');

ALTER TABLE "push_tokens" ALTER COLUMN "created_at" TYPE timestamp with time zone
  USING "created_at" AT TIME ZONE current_setting('TimeZone');

ALTER TABLE "push_tokens" ALTER COLUMN "last_seen_at" TYPE timestamp with time zone
  USING "last_seen_at" AT TIME ZONE current_setting('TimeZone');

ALTER TABLE "analytics_events" ALTER COLUMN "created_at" TYPE timestamp with time zone
  USING "created_at" AT TIME ZONE current_setting('TimeZone');

ALTER TABLE "products" ALTER COLUMN "created_at" TYPE timestamp with time zone
  USING "created_at" AT TIME ZONE current_setting('TimeZone');
