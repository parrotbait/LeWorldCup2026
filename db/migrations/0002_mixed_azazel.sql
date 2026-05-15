CREATE TABLE IF NOT EXISTS "bonus_resolutions" (
	"kind" "bonus_kind" NOT NULL,
	"group_letter" text DEFAULT '' NOT NULL,
	"team_ids" integer[] DEFAULT '{}' NOT NULL,
	"player_names" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bonus_resolutions_kind_group_letter_pk" PRIMARY KEY("kind","group_letter")
);
