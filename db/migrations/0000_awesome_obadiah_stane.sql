CREATE TYPE "public"."bonus_kind" AS ENUM('WINNER', 'TOP_SCORER', 'GROUP_WINNER', 'DARK_HORSE', 'WOODEN_SPOON', 'FIRST_GOAL_SCORER');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."round" AS ENUM('GROUP', 'R32', 'R16', 'QF', 'SF', 'THIRD', 'FINAL');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bonus_picks" (
	"player_id" integer NOT NULL,
	"kind" "bonus_kind" NOT NULL,
	"group_letter" text,
	"team_id" integer,
	"player_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bonus_picks_player_id_kind_group_letter_pk" PRIMARY KEY("player_id","kind","group_letter")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jokers" (
	"player_id" integer NOT NULL,
	"round" "round" NOT NULL,
	"match_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jokers_player_id_round_pk" PRIMARY KEY("player_id","round")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" integer,
	"round" "round" NOT NULL,
	"group_letter" text,
	"match_number" smallint,
	"kickoff" timestamp with time zone NOT NULL,
	"home_team_id" integer,
	"away_team_id" integer,
	"home_score" smallint,
	"away_score" smallint,
	"winner_team_id" integer,
	"status" "match_status" DEFAULT 'SCHEDULED' NOT NULL,
	"admin_overridden" boolean DEFAULT false NOT NULL,
	"venue" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "predictions" (
	"player_id" integer NOT NULL,
	"match_id" integer NOT NULL,
	"home_score" smallint NOT NULL,
	"away_score" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "predictions_player_id_match_id_pk" PRIMARY KEY("player_id","match_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"tournament_kickoff" timestamp with time zone NOT NULL,
	"winner_team_id" integer,
	"top_scorer_name" text,
	"first_goal_scorer_name" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"group_letter" text,
	"fifa_ranking" smallint,
	"pot" smallint
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bonus_picks" ADD CONSTRAINT "bonus_picks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bonus_picks" ADD CONSTRAINT "bonus_picks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jokers" ADD CONSTRAINT "jokers_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jokers" ADD CONSTRAINT "jokers_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "predictions" ADD CONSTRAINT "predictions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "predictions" ADD CONSTRAINT "predictions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settings" ADD CONSTRAINT "settings_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "matches_external_id_uq" ON "matches" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_kickoff_idx" ON "matches" USING btree ("kickoff");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_round_idx" ON "matches" USING btree ("round");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "players_display_name_uq" ON "players" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "predictions_match_idx" ON "predictions" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teams_code_uq" ON "teams" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_group_idx" ON "teams" USING btree ("group_letter");