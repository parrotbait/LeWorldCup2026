ALTER TABLE "matches" ADD COLUMN "first_locked_at" timestamp with time zone;--> statement-breakpoint
-- Backfill existing rows: lock time = kickoff - 15 min. Future inserts get
-- this set explicitly by the cron / sim; updates never overwrite it.
UPDATE "matches" SET "first_locked_at" = "kickoff" - INTERVAL '15 minutes' WHERE "first_locked_at" IS NULL;