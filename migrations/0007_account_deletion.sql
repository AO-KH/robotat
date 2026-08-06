-- Account deletion (App Store Guideline 5.1.1(v)) requires detaching a user's
-- assessments rather than destroying them: the assessment records work ROBOTAT
-- actually performed and may have invoiced. Detaching means nulling user_id, which
-- the NOT NULL constraint currently forbids.
ALTER TABLE "assessments" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint

-- Both foreign keys are NO ACTION today, so deleting a user throws 23503. The
-- application deletes inside a transaction that nulls these first, so these clauses
-- are a safety net rather than the mechanism — they stop a future code path from
-- being blocked, or worse, from cascading away business records by accident.
ALTER TABLE "assessments" DROP CONSTRAINT "assessments_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" DROP CONSTRAINT "analytics_events_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
