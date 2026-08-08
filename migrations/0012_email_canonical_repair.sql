-- Recompute email_canonical, for the databases that already ran the broken 0011.
--
-- 0011's backfill was corrected in place rather than superseded, and on a database that
-- has not run it yet that is the whole fix. This file exists because editing it does
-- nothing for a database that has.
--
-- drizzle's migrator decides what to apply by TIMESTAMP, not by content: it reads the
-- newest `created_at` in drizzle.__drizzle_migrations and runs every journal entry whose
-- `when` is greater. The file's sha256 is written into that table but is never compared
-- against anything. So an already-applied migration whose .sql changed is skipped in
-- silence — no re-run, no warning, no error. Every database that ran the old 0011 keeps
-- the values the old 0011 wrote, forever, and would never learn otherwise.
--
-- The reverse split does not work either: a 0012 on its own cannot rescue a populated
-- database that has yet to run 0011, because 0011's CREATE UNIQUE INDEX fails first and
-- takes the shared transaction — and therefore 0012 — down with it. Correcting 0011 for
-- the databases ahead of it and adding this for the databases behind it is the only pair
-- that converges from both directions.
--
-- Every row, not just the visibly wrong ones. The expression is a pure function of
-- `email`, so re-running it over a correct column writes each row back unchanged; a
-- WHERE clause narrowing this to the shapes 0011 is known to have got wrong would only
-- encode today's list of known bugs into the repair for all of them.
--
-- This must stay identical to 0011's expression and to canonicalEmail() in
-- auth.service.ts. test/canonical-email.test.ts reads it out of this file and checks it,
-- the same way it checks 0011.
--
-- If this statement fails with a unique violation on users_email_canonical_idx, that is
-- not a bug here: it means two accounts on that database really do share one mailbox —
-- one of them registered through the hole the broken backfill left open. Which of the
-- two to keep is a decision about a customer's data, so the migration refuses rather
-- than picking one.
UPDATE "users" SET "email_canonical" =
  CASE
    WHEN split_part(lower("email"), '@', 2) IN ('gmail.com', 'googlemail.com')
     AND replace(split_part(split_part(lower("email"), '@', 1), '+', 1), '.', '') <> '' THEN
      replace(split_part(split_part(lower("email"), '@', 1), '+', 1), '.', '') || '@gmail.com'
    WHEN split_part(lower("email"), '@', 2) IN (
      'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com',
      'protonmail.com', 'proton.me', 'fastmail.com'
    )
     AND split_part(split_part(lower("email"), '@', 1), '+', 1) <> '' THEN
      split_part(split_part(lower("email"), '@', 1), '+', 1) || '@' || split_part(lower("email"), '@', 2)
    ELSE lower("email")
  END;
