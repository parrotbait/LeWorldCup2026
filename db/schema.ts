import {
    pgTable,
    text,
    integer,
    timestamp,
    boolean,
    primaryKey,
    uniqueIndex,
    index,
    pgEnum,
    serial,
    smallint,
} from "drizzle-orm/pg-core";

// Tournament rounds in the order matches are scored.
export const roundEnum = pgEnum("round", [
    "GROUP",
    "R32",
    "R16",
    "QF",
    "SF",
    "THIRD",
    "FINAL",
]);

// Match status mirrors football-data.org's status field, simplified.
export const matchStatusEnum = pgEnum("match_status", [
    "SCHEDULED",
    "LIVE",
    "FINISHED",
    "POSTPONED",
    "CANCELLED",
]);

// ---------------------------------------------------------------------------
// Players (one row per friend in the group; ~12 total)
// ---------------------------------------------------------------------------
export const players = pgTable(
    "players",
    {
        id: serial("id").primaryKey(),
        displayName: text("display_name").notNull(),
        // Used to identify a returning player without an email.
        // Stored hashed; the cookie carries the player id, not this token.
        joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
        isAdmin: boolean("is_admin").default(false).notNull(),
    },
    (t) => ({
        displayNameUq: uniqueIndex("players_display_name_uq").on(t.displayName),
    }),
);

// ---------------------------------------------------------------------------
// Teams (48 World Cup teams)
// ---------------------------------------------------------------------------
export const teams = pgTable(
    "teams",
    {
        id: serial("id").primaryKey(),
        // ISO 3-letter code (FRA, MEX, USA, …); also used for emoji flag lookup.
        code: text("code").notNull(),
        name: text("name").notNull(),
        // Group letter A–L, nullable until draw is reflected.
        groupLetter: text("group_letter"),
        // Optional FIFA ranking at draw time; used for "dark horse" eligibility.
        fifaRanking: smallint("fifa_ranking"),
        // Pot 1–4 from the draw; used for "dark horse" eligibility (pot 3 or 4).
        pot: smallint("pot"),
    },
    (t) => ({
        codeUq: uniqueIndex("teams_code_uq").on(t.code),
        groupIdx: index("teams_group_idx").on(t.groupLetter),
    }),
);

// ---------------------------------------------------------------------------
// Matches (104 total: 72 group + 32 knockout)
// ---------------------------------------------------------------------------
export const matches = pgTable(
    "matches",
    {
        id: serial("id").primaryKey(),
        // External id from football-data.org for stable upserts.
        externalId: integer("external_id"),
        round: roundEnum("round").notNull(),
        // Group letter for GROUP round, null for knockouts.
        groupLetter: text("group_letter"),
        // Match number for human ordering ("1/8 #3", "QF #2", etc.).
        matchNumber: smallint("match_number"),
        kickoff: timestamp("kickoff", { withTimezone: true }).notNull(),
        homeTeamId: integer("home_team_id").references(() => teams.id),
        awayTeamId: integer("away_team_id").references(() => teams.id),
        // Scores at full-time (90 min + ET in knockouts). Null until finished.
        homeScore: smallint("home_score"),
        awayScore: smallint("away_score"),
        // For knockouts that go to penalties; the team that advances.
        // Used for advancement-based bonuses, not for prediction scoring.
        winnerTeamId: integer("winner_team_id").references(() => teams.id),
        status: matchStatusEnum("status").default("SCHEDULED").notNull(),
        // Allow admin to mark a match as manually overridden so cron won't clobber.
        adminOverridden: boolean("admin_overridden").default(false).notNull(),
        venue: text("venue"),
    },
    (t) => ({
        externalIdUq: uniqueIndex("matches_external_id_uq").on(t.externalId),
        kickoffIdx: index("matches_kickoff_idx").on(t.kickoff),
        roundIdx: index("matches_round_idx").on(t.round),
    }),
);

// ---------------------------------------------------------------------------
// Predictions (one per (player, match))
// ---------------------------------------------------------------------------
export const predictions = pgTable(
    "predictions",
    {
        playerId: integer("player_id")
            .references(() => players.id, { onDelete: "cascade" })
            .notNull(),
        matchId: integer("match_id")
            .references(() => matches.id, { onDelete: "cascade" })
            .notNull(),
        homeScore: smallint("home_score").notNull(),
        awayScore: smallint("away_score").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.playerId, t.matchId] }),
        matchIdx: index("predictions_match_idx").on(t.matchId),
    }),
);

// ---------------------------------------------------------------------------
// Bonus picks (one row per (player, bonusType))
// ---------------------------------------------------------------------------
export const bonusKindEnum = pgEnum("bonus_kind", [
    "WINNER",
    "TOP_SCORER",
    "GROUP_WINNER",
    "DARK_HORSE",
    "WOODEN_SPOON",
    "FIRST_GOAL_SCORER",
    // Anti-bonuses — reward picks that excel at being rubbish.
    "PANTOMIME_VILLAIN", // most yellow + red cards
    "SIEVE", // most goals conceded
    "MIGHTY_FALLEN", // Pot-1 team that crashes out in the group stage
]);

export const bonusPicks = pgTable(
    "bonus_picks",
    {
        playerId: integer("player_id")
            .references(() => players.id, { onDelete: "cascade" })
            .notNull(),
        kind: bonusKindEnum("kind").notNull(),
        // For GROUP_WINNER: the group letter. For others: null.
        groupLetter: text("group_letter"),
        // Team-based picks (winner, group winner, dark horse, wooden spoon).
        teamId: integer("team_id").references(() => teams.id),
        // Free-form for player-based picks (top scorer, first goal scorer)
        // until we model players-of-teams. Stored as written so we can match leniently.
        playerName: text("player_name"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.playerId, t.kind, t.groupLetter] }),
    }),
);

// ---------------------------------------------------------------------------
// Joker (one row per (player, round)) — doubles prediction points for the chosen match in that round.
// ---------------------------------------------------------------------------
export const jokers = pgTable(
    "jokers",
    {
        playerId: integer("player_id")
            .references(() => players.id, { onDelete: "cascade" })
            .notNull(),
        round: roundEnum("round").notNull(),
        matchId: integer("match_id")
            .references(() => matches.id, { onDelete: "cascade" })
            .notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.playerId, t.round] }),
    }),
);

// ---------------------------------------------------------------------------
// Tournament-wide settings (single row, id=1).
// Held in DB so admin can tweak without redeploying.
// ---------------------------------------------------------------------------
export const settings = pgTable("settings", {
    id: integer("id").primaryKey(),
    // Bonus picks lock at this instant.
    tournamentKickoff: timestamp("tournament_kickoff", { withTimezone: true }).notNull(),
    // Resolved values (set by admin once known).
    winnerTeamId: integer("winner_team_id").references(() => teams.id),
    topScorerName: text("top_scorer_name"),
    firstGoalScorerName: text("first_goal_scorer_name"),
});

// ---------------------------------------------------------------------------
// Bonus resolutions — admin-set ground truth for each bonus kind.
//
// One row per (kind, groupLetter). For non-group bonuses groupLetter is "".
// teamIds / playerNames are arrays so ties (e.g. shared Golden Boot, two
// teams tied on cards) credit every player who picked any tied option.
// ---------------------------------------------------------------------------
export const bonusResolutions = pgTable(
    "bonus_resolutions",
    {
        kind: bonusKindEnum("kind").notNull(),
        groupLetter: text("group_letter").default("").notNull(),
        teamIds: integer("team_ids").array().default([]).notNull(),
        playerNames: text("player_names").array().default([]).notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.kind, t.groupLetter] }),
    }),
);

// ---------------------------------------------------------------------------
// Audit log (admin actions; small but valuable for sanity checks)
// ---------------------------------------------------------------------------
export const auditLog = pgTable("audit_log", {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    detail: text("detail"),
});

// Type exports for ergonomic use elsewhere.
export type Player = typeof players.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Prediction = typeof predictions.$inferSelect;
export type BonusPick = typeof bonusPicks.$inferSelect;
export type Joker = typeof jokers.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type BonusResolution = typeof bonusResolutions.$inferSelect;
