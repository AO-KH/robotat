-- Device tokens for native push (APNs). One row per device, keyed by the token.
--
-- UNIQUE is on "token" alone, not (user_id, token): a phone can be handed to another
-- person who signs in with their own account, and registration then has to reassign
-- that token rather than store it twice.
--
-- ON DELETE cascade is deliberate and is the ONLY thing cleaning these up: account
-- deletion (deleteAccountAndAnonymise) detaches assessments and analytics events but
-- says nothing about push tokens, so without the cascade a deleted user's device would
-- leave a row pointing at a user that no longer exists.
CREATE TABLE "push_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"platform" text DEFAULT 'ios' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"last_seen_at" timestamp DEFAULT now(),
	CONSTRAINT "push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens" USING btree ("user_id");
