-- Remove the FIRST_GOAL_SCORER bonus: drop any picks/resolutions of that kind,
-- drop the redundant settings column, and rebuild the bonus_kind enum without
-- the value (Postgres has no native ALTER TYPE ... DROP VALUE).

DELETE FROM "bonus_picks" WHERE "kind" = 'FIRST_GOAL_SCORER';--> statement-breakpoint
DELETE FROM "bonus_resolutions" WHERE "kind" = 'FIRST_GOAL_SCORER';--> statement-breakpoint

ALTER TABLE "settings" DROP COLUMN IF EXISTS "first_goal_scorer_name";--> statement-breakpoint

ALTER TYPE "public"."bonus_kind" RENAME TO "bonus_kind__old";--> statement-breakpoint
CREATE TYPE "public"."bonus_kind" AS ENUM(
    'WINNER',
    'TOP_SCORER',
    'GROUP_WINNER',
    'DARK_HORSE',
    'WOODEN_SPOON',
    'PANTOMIME_VILLAIN',
    'SIEVE',
    'MIGHTY_FALLEN'
);--> statement-breakpoint
ALTER TABLE "bonus_picks"
    ALTER COLUMN "kind" TYPE "public"."bonus_kind"
    USING "kind"::text::"public"."bonus_kind";--> statement-breakpoint
ALTER TABLE "bonus_resolutions"
    ALTER COLUMN "kind" TYPE "public"."bonus_kind"
    USING "kind"::text::"public"."bonus_kind";--> statement-breakpoint
DROP TYPE "public"."bonus_kind__old";
