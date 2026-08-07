-- One inbox, one account.
--
-- `email` is already UNIQUE and lowercased, which stops the obvious duplicate and
-- nothing else. Gmail ignores dots in the local part and everything after a `+`, so
-- abdullahkh250@, abdullah.kh250@ and abdullahkh250+farm@gmail.com were three separate
-- accounts sharing one mailbox. Each received its own verification code at that mailbox,
-- verified cleanly, and carried its own allowance under the per-account booking cap —
-- which is how a three-a-day limit becomes fifteen for anyone who noticed.
--
-- This column holds the comparison form. The address the customer typed stays in
-- `email`, because that is the one they recognise and the one we write to; only the
-- uniqueness check uses the normalised value.
--
-- The UNIQUE constraint is the point. The registration route checks first and returns a
-- readable 409, but a check-then-insert is a race, and the database is the only place
-- the rule cannot be got round.
--
-- The backfill mirrors canonicalEmail() in auth.service.ts. It is deliberately narrow —
-- dots and plus for Google, plus only for the other providers the TS list covers — and
-- it must stay in step with that function; the tests assert the behaviour they share.
ALTER TABLE "users" ADD COLUMN "email_canonical" text;--> statement-breakpoint

UPDATE "users" SET "email_canonical" =
  CASE
    WHEN split_part(lower("email"), '@', 2) IN ('gmail.com', 'googlemail.com') THEN
      replace(split_part(split_part(lower("email"), '@', 1), '+', 1), '.', '') || '@gmail.com'
    WHEN split_part(lower("email"), '@', 2) IN (
      'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com',
      'protonmail.com', 'proton.me', 'fastmail.com'
    ) THEN
      split_part(split_part(lower("email"), '@', 1), '+', 1) || '@' || split_part(lower("email"), '@', 2)
    ELSE lower("email")
  END;--> statement-breakpoint

ALTER TABLE "users" ALTER COLUMN "email_canonical" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_canonical_idx" ON "users" USING btree ("email_canonical");
