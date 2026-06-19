CREATE TYPE "public"."snapshot_cause" AS ENUM('TOURNAMENT_START', 'MATCH', 'BONUS', 'CORRECTION');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leaderboard_snapshot_rows" (
	"snapshot_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"rank" smallint NOT NULL,
	"points" integer NOT NULL,
	"bonus_points" integer NOT NULL,
	"rank_delta" smallint NOT NULL,
	"points_delta" integer NOT NULL,
	CONSTRAINT "leaderboard_snapshot_rows_snapshot_id_player_id_pk" PRIMARY KEY("snapshot_id","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leaderboard_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"cause_kind" "snapshot_cause" NOT NULL,
	"cause_match_id" integer,
	"cause_bonus_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leaderboard_snapshot_rows" ADD CONSTRAINT "leaderboard_snapshot_rows_snapshot_id_leaderboard_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."leaderboard_snapshots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leaderboard_snapshot_rows" ADD CONSTRAINT "leaderboard_snapshot_rows_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_cause_match_id_matches_id_fk" FOREIGN KEY ("cause_match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leaderboard_snapshots_captured_at_idx" ON "leaderboard_snapshots" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leaderboard_snapshots_cause_match_idx" ON "leaderboard_snapshots" USING btree ("cause_kind","cause_match_id");