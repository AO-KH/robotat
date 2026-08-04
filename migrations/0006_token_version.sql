-- Bearer tokens are stateless, so nothing could revoke one before it expired: a
-- password reset left an attacker's 30-day token working. token_version is embedded
-- as a claim at issue time and compared on every bearer request; bumping it
-- invalidates every token minted for that user.
ALTER TABLE "users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;
