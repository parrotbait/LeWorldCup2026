-- Backfill any existing null group_letters before promoting the column to NOT NULL.
UPDATE "bonus_picks" SET "group_letter" = '' WHERE "group_letter" IS NULL;--> statement-breakpoint
ALTER TABLE "bonus_picks" ALTER COLUMN "group_letter" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "bonus_picks" ALTER COLUMN "group_letter" SET NOT NULL;
