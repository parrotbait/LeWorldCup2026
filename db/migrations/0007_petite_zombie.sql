ALTER TABLE "matches" ADD COLUMN "home_score_ft" smallint;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_score_ft" smallint;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_score_pens" smallint;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_score_pens" smallint;--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "first_goal_scorer_name";--> statement-breakpoint
ALTER TABLE "public"."bonus_picks" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."bonus_resolutions" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."bonus_kind";--> statement-breakpoint
CREATE TYPE "public"."bonus_kind" AS ENUM('WINNER', 'TOP_SCORER', 'GROUP_WINNER', 'DARK_HORSE', 'WOODEN_SPOON', 'PANTOMIME_VILLAIN', 'SIEVE', 'MIGHTY_FALLEN');--> statement-breakpoint
ALTER TABLE "public"."bonus_picks" ALTER COLUMN "kind" SET DATA TYPE "public"."bonus_kind" USING "kind"::"public"."bonus_kind";--> statement-breakpoint
ALTER TABLE "public"."bonus_resolutions" ALTER COLUMN "kind" SET DATA TYPE "public"."bonus_kind" USING "kind"::"public"."bonus_kind";