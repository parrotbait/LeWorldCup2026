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
        // Public-facing label on the leaderboard. Also unique so two friends
        // can't share the same name, but no longer used for login.
        displayName: text("display_name").notNull(),
        // Login key. Lower-cased on insert. Required since the email-based
        // login switch — historic rows from before this column existed should
        // be backfilled or cleared by admin.
        email: text("email").notNull(),
        // scrypt hash (see lib/password.ts). Null only for legacy rows from the
        // pre-password auth flow — those can't log in until admin resets.
        passwordHash: text("password_hash"),
        joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
        isAdmin: boolean("is_admin").default(false).notNull(),
    },
    (t) => ({
        displayNameUq: uniqueIndex("players_display_name_uq").on(t.displayName),
        emailUq: uniqueIndex("players_email_uq").on(t.email),
    }),
);

// ---------------------------------------------------------------------------
// Password reset tokens (single-use, short-lived).
// ---------------------------------------------------------------------------
export const passwordResetTokens = pgTable("password_reset_tokens", {
    id: serial("id").primaryKey(),
    playerId: integer("player_id")
        .references(() => players.id, { onDelete: "cascade" })
        .notNull(),
    // SHA-256 hash of the raw token. The raw token is only ever sent in the
    // reset email — DB compromise doesn't enable a reset on its own.
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
        // The lock time computed when this match was first ingested. Once a
        // match has ever passed this point, predictions are permanently
        // locked even if FIFA later reschedules and the cron pushes kickoff
        // out — see savePredictionAction. Set on insert, never updated.
        firstLockedAt: timestamp("first_locked_at", { withTimezone: true }),
        homeTeamId: integer("home_team_id").references(() => teams.id),
        awayTeamId: integer("away_team_id").references(() => teams.id),
        // Canonical "scoring score": 90-min for groups, AET-final for
        // knockouts that go to extra time. Penalty shootouts are NOT folded
        // into this — see homeScorePens/awayScorePens for those. Null until
        // the match has finished.
        homeScore: smallint("home_score"),
        awayScore: smallint("away_score"),
        // Display-only: 90-minute score, captured separately so the UI can
        // show "1–1 FT, 2–2 AET, pens 4–3" without losing detail.
        homeScoreFt: smallint("home_score_ft"),
        awayScoreFt: smallint("away_score_ft"),
        // Display-only: penalty-shootout score. Not used by predictionPoints.
        homeScorePens: smallint("home_score_pens"),
        awayScorePens: smallint("away_score_pens"),
        // For knockouts that go to penalties; the team that advances.
        // Used for advancement-based bonuses (dark horse), not for prediction
        // scoring (see docs/game-design.md §3).
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
    // Anti-bonuses — reward picks that excel at being rubbish.
    "PANTOMIME_VILLAIN", // most yellow + red cards
    "SIEVE", // most goals conceded
    "MIGHTY_FALLEN", // Pot-1 team that crashes out in the group stage
    // Player-stat bonus added in 2026-06.
    "MOST_ASSISTS",
]);

export const bonusPicks = pgTable(
    "bonus_picks",
    {
        playerId: integer("player_id")
            .references(() => players.id, { onDelete: "cascade" })
            .notNull(),
        kind: bonusKindEnum("kind").notNull(),
        // Empty string for non-group bonuses; the group letter ("A"-"L") for GROUP_WINNER.
        // Empty default + NOT NULL avoids the composite-PK NOT NULL trap that bit us
        // (Postgres requires PK columns to be non-null even if Drizzle types say otherwise).
        groupLetter: text("group_letter").default("").notNull(),
        // Team-based picks (winner, group winner, dark horse, wooden spoon, anti-bonuses).
        teamId: integer("team_id").references(() => teams.id),
        // Free-form for player-based picks (top scorer)
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

// ---------------------------------------------------------------------------
// Leaderboard snapshots — one parent row per capture event, 11 child rows
// per snapshot (one per player). Powers the position-over-time chart and the
// ▲/▼ position-change indicators on the leaderboard table.
//
// Snapshots fire on:
//   • TOURNAMENT_START — synthetic anchor at the opening match's kickoff,
//     all players tied at rank 1 with 0 points.
//   • MATCH — once per match transitioning to FINISHED, stamped at
//     `kickoff + 110m` (a deterministic "after the whistle" instant so the
//     chart's x-axis tracks real match timing rather than cron jitter).
//   • BONUS — once per `bonusResolutions` save that actually changed the
//     resolved teams/players, stamped at the moment of save.
//   • CORRECTION — once per previously-finished match whose score changes
//     after the fact, stamped at the moment of the correction.
//
// Display rank stored here is the **points-only 1224 rank**: tied players
// share a number, the next distinct points value gets the slot it would
// have occupied. Row ordering on the leaderboard table still uses the full
// tie-break comparator (see compareLeaderboardRows in lib/scoring.ts).
// ---------------------------------------------------------------------------
export const snapshotCauseEnum = pgEnum("snapshot_cause", [
    "TOURNAMENT_START",
    "MATCH",
    "BONUS",
    "CORRECTION",
]);

export const leaderboardSnapshots = pgTable(
    "leaderboard_snapshots",
    {
        id: serial("id").primaryKey(),
        // The instant on the chart's x-axis. For MATCH snapshots this is
        // `kickoff + 110m`, NOT the cron's wall-clock — keeps the timeline
        // honest regardless of when the cron actually ran.
        capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
        causeKind: snapshotCauseEnum("cause_kind").notNull(),
        // FK for MATCH and CORRECTION snapshots. Null for TOURNAMENT_START
        // and BONUS. ON DELETE SET NULL because dropping a match shouldn't
        // cascade-delete history; the snapshot still records what happened.
        causeMatchId: integer("cause_match_id").references(() => matches.id, {
            onDelete: "set null",
        }),
        // BonusKind string when causeKind = BONUS; null otherwise. Stored as
        // text rather than enum to avoid coupling to bonusKindEnum's lifecycle.
        causeBonusKind: text("cause_bonus_kind"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => ({
        capturedAtIdx: index("leaderboard_snapshots_captured_at_idx").on(t.capturedAt),
        // Composite index drives gap detection: "find FINISHED matches with
        // no MATCH snapshot" filters by causeKind first, then matches by id.
        causeMatchIdx: index("leaderboard_snapshots_cause_match_idx").on(
            t.causeKind,
            t.causeMatchId,
        ),
    }),
);

export const leaderboardSnapshotRows = pgTable(
    "leaderboard_snapshot_rows",
    {
        snapshotId: integer("snapshot_id")
            .references(() => leaderboardSnapshots.id, { onDelete: "cascade" })
            .notNull(),
        playerId: integer("player_id")
            .references(() => players.id, { onDelete: "cascade" })
            .notNull(),
        // Points-only 1224 rank. See module-level comment above.
        rank: smallint("rank").notNull(),
        points: integer("points").notNull(),
        bonusPoints: integer("bonus_points").notNull(),
        // Pre-computed at write time so the chart endpoint stays cheap.
        // Positive rankDelta = moved up the table (lower rank number).
        rankDelta: smallint("rank_delta").notNull(),
        pointsDelta: integer("points_delta").notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.snapshotId, t.playerId] }),
    }),
);

// Type exports for ergonomic use elsewhere.
export type Player = typeof players.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Prediction = typeof predictions.$inferSelect;
export type BonusPick = typeof bonusPicks.$inferSelect;
export type Joker = typeof jokers.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type BonusResolution = typeof bonusResolutions.$inferSelect;
export type LeaderboardSnapshot = typeof leaderboardSnapshots.$inferSelect;
export type LeaderboardSnapshotRow = typeof leaderboardSnapshotRows.$inferSelect;
