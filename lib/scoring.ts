/**
 * Pure scoring functions for LeWorldCup 2026.
 *
 * No DB access, no I/O — all inputs come from the caller. This makes the
 * engine trivial to unit-test and lets the leaderboard recompute deterministically.
 *
 * Rules source: docs/game-design.md.
 */

export type Round = "GROUP" | "R32" | "R16" | "QF" | "SF" | "THIRD" | "FINAL";

export interface MatchScore {
    homeScore: number;
    awayScore: number;
}

export interface MatchLite extends MatchScore {
    id: number;
    round: Round;
}

export interface PredictionLite extends MatchScore {
    matchId: number;
}

export type Outcome = "HOME" | "AWAY" | "DRAW";

export function outcome(s: MatchScore): Outcome {
    if (s.homeScore > s.awayScore) {
        return "HOME";
    }
    if (s.awayScore > s.homeScore) {
        return "AWAY";
    }
    return "DRAW";
}

const GROUP_RESULT = 2;
const GROUP_EXACT = 4;
const KO_RESULT = 3;
const KO_EXACT = 6;

/**
 * Points awarded for a single prediction against a settled match score.
 *
 * Returns 0 if the match has no score yet, or if result and exact both miss.
 * Exact-score points are NOT additive on top of result points — exact replaces.
 */
export function predictionPoints(
    match: { round: Round; homeScore: number | null; awayScore: number | null },
    prediction: MatchScore | undefined,
): number {
    if (
        prediction === undefined ||
        match.homeScore === null ||
        match.awayScore === null
    ) {
        return 0;
    }
    const isGroup = match.round === "GROUP";
    const exactPts = isGroup ? GROUP_EXACT : KO_EXACT;
    const resultPts = isGroup ? GROUP_RESULT : KO_RESULT;

    const exact =
        prediction.homeScore === match.homeScore &&
        prediction.awayScore === match.awayScore;
    if (exact) {
        return exactPts;
    }
    const correctResult =
        outcome(prediction) ===
        outcome({ homeScore: match.homeScore, awayScore: match.awayScore });
    return correctResult ? resultPts : 0;
}

/** Whether this prediction was an exact match. Used for tie-breakers. */
export function isExact(
    match: { homeScore: number | null; awayScore: number | null },
    prediction: MatchScore | undefined,
): boolean {
    if (
        prediction === undefined ||
        match.homeScore === null ||
        match.awayScore === null
    ) {
        return false;
    }
    return (
        prediction.homeScore === match.homeScore &&
        prediction.awayScore === match.awayScore
    );
}

// ---------------------------------------------------------------------------
// Bonuses
// ---------------------------------------------------------------------------

export const BONUS_POINTS = {
    WINNER: 25,
    TOP_SCORER: 10,
    GROUP_WINNER: 3, // per correct group, max 12 × 3 = 36
    WOODEN_SPOON: 5,
    FIRST_GOAL_SCORER: 5,
} as const;

/**
 * Cumulative dark-horse payouts by furthest stage reached.
 *
 * "Reached SF" means the team played in a semi-final, even if they lost it.
 */
export const DARK_HORSE_RUNNING_TOTAL: Record<DarkHorseStage, number> = {
    OUT_IN_GROUPS: 0,
    INTO_R32: 2,
    INTO_R16: 6,
    INTO_QF: 12,
    INTO_SF: 22,
    INTO_FINAL: 37,
    WON: 57,
};

export type DarkHorseStage =
    | "OUT_IN_GROUPS"
    | "INTO_R32"
    | "INTO_R16"
    | "INTO_QF"
    | "INTO_SF"
    | "INTO_FINAL"
    | "WON";

export function darkHorsePoints(stage: DarkHorseStage): number {
    return DARK_HORSE_RUNNING_TOTAL[stage];
}

// ---------------------------------------------------------------------------
// Joker: ×2 multiplier on prediction points for a chosen match in a round.
// ---------------------------------------------------------------------------

export interface PlayerLeaderboardRow {
    playerId: number;
    displayName: string;
    points: number;
    exactCount: number;
    bonusPoints: number;
    knockoutResults: number;
    joinedAt: Date;
}

export interface ScoringInput {
    players: { id: number; displayName: string; joinedAt: Date }[];
    matches: { id: number; round: Round; homeScore: number | null; awayScore: number | null }[];
    predictions: { playerId: number; matchId: number; homeScore: number; awayScore: number }[];
    /** Player → round → matchId chosen as joker for that round. */
    jokers: { playerId: number; round: Round; matchId: number }[];
    /** Already-resolved bonus point totals per player (computed elsewhere as the tournament progresses). */
    bonusPointsByPlayer: Map<number, number>;
}

/**
 * Compute the full leaderboard from scratch.
 *
 * Idempotent and pure. Cheap enough to call on every read for our scale (~12 players × ~104 matches).
 */
export function buildLeaderboard(input: ScoringInput): PlayerLeaderboardRow[] {
    const matchById = new Map(input.matches.map((m) => [m.id, m]));
    const predByPlayerMatch = new Map<string, (typeof input.predictions)[number]>();
    for (const p of input.predictions) {
        predByPlayerMatch.set(`${p.playerId}:${p.matchId}`, p);
    }
    const jokerByPlayerRound = new Map<string, number>();
    for (const j of input.jokers) {
        jokerByPlayerRound.set(`${j.playerId}:${j.round}`, j.matchId);
    }

    const rows: PlayerLeaderboardRow[] = input.players.map((player) => {
        let predPts = 0;
        let exactCount = 0;
        let knockoutResults = 0;

        for (const match of input.matches) {
            const pred = predByPlayerMatch.get(`${player.id}:${match.id}`);
            if (pred === undefined) {
                continue;
            }
            const base = predictionPoints(match, pred);
            const jokerMatchId = jokerByPlayerRound.get(`${player.id}:${match.round}`);
            const multiplier = jokerMatchId === match.id ? 2 : 1;
            predPts += base * multiplier;

            if (isExact(match, pred)) {
                exactCount += 1;
            }
            if (match.round !== "GROUP" && base > 0) {
                knockoutResults += 1;
            }
        }

        const bonusPts = input.bonusPointsByPlayer.get(player.id) ?? 0;

        return {
            playerId: player.id,
            displayName: player.displayName,
            points: predPts + bonusPts,
            exactCount,
            bonusPoints: bonusPts,
            knockoutResults,
            joinedAt: player.joinedAt,
        };
    });

    rows.sort(compareLeaderboardRows);
    return rows;
}

/**
 * Tie-breaker order (per docs/game-design.md §3):
 *   1. Total points (desc)
 *   2. Exact-score predictions (desc)
 *   3. Bonus points (desc)
 *   4. Correct knockout results (desc)
 *   5. Earliest signup (asc)
 *   6. Coin flip — left to admin; here we sort by playerId for stability.
 */
export function compareLeaderboardRows(
    a: PlayerLeaderboardRow,
    b: PlayerLeaderboardRow,
): number {
    if (a.points !== b.points) {
        return b.points - a.points;
    }
    if (a.exactCount !== b.exactCount) {
        return b.exactCount - a.exactCount;
    }
    if (a.bonusPoints !== b.bonusPoints) {
        return b.bonusPoints - a.bonusPoints;
    }
    if (a.knockoutResults !== b.knockoutResults) {
        return b.knockoutResults - a.knockoutResults;
    }
    if (a.joinedAt.getTime() !== b.joinedAt.getTime()) {
        return a.joinedAt.getTime() - b.joinedAt.getTime();
    }
    return a.playerId - b.playerId;
}
