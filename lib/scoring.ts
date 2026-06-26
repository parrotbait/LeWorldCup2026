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
 * Returns 0 if the match has no score yet, isn't finished, or if result and
 * exact both miss. Exact-score points are NOT additive on top of result
 * points — exact replaces.
 *
 * The "score" here is the final scoreboard score: 90 minutes for group games,
 * AET-inclusive for knockouts that go to extra time. Penalty-shootout
 * outcomes are NOT considered for scoring — see docs/game-design.md §3 and
 * the rules page. A knockout decided on penalties is therefore a draw for
 * scoring purposes (only an exact-score pick of the AET final pays out).
 *
 * `match.status` is required and must be FINISHED — football-data populates a
 * running `fullTime` score during play, so without this gate every LIVE
 * match would award provisional points that flip with each goal.
 */
export function predictionPoints(
    match: {
        round: Round;
        homeScore: number | null;
        awayScore: number | null;
        status?: string | null;
    },
    prediction: MatchScore | undefined,
): number {
    if (
        prediction === undefined ||
        match.homeScore === null ||
        match.awayScore === null
    ) {
        return 0;
    }
    // Only FINISHED matches award points. LIVE/PAUSED/POSTPONED don't, even
    // if a running score has been written.
    if (match.status !== undefined && match.status !== null && match.status !== "FINISHED") {
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
    match: {
        homeScore: number | null;
        awayScore: number | null;
        status?: string | null;
    },
    prediction: MatchScore | undefined,
): boolean {
    if (
        prediction === undefined ||
        match.homeScore === null ||
        match.awayScore === null
    ) {
        return false;
    }
    if (match.status !== undefined && match.status !== null && match.status !== "FINISHED") {
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
    MOST_ASSISTS: 10, // mirrors Golden Boot — top assister(s) of the tournament
    GROUP_WINNER: 3, // per correct group, max 12 × 3 = 36
    WOODEN_SPOON: 5,
    // Anti-bonuses — reward picking who'll be rubbish.
    PANTOMIME_VILLAIN: 5, // most cards across the tournament
    SIEVE: 5, // most goals conceded
    MIGHTY_FALLEN: 8, // Pot-1 team eliminated in the group stage; rated higher because going against the favourites is a bigger call
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

const DARK_HORSE_STAGE_LABEL: Record<DarkHorseStage, string> = {
    OUT_IN_GROUPS: "out in groups",
    INTO_R32: "reached R32",
    INTO_R16: "reached R16",
    INTO_QF: "reached QF",
    INTO_SF: "reached SF",
    INTO_FINAL: "reached Final",
    WON: "won the tournament",
};

export function darkHorsePoints(stage: DarkHorseStage): number {
    return DARK_HORSE_RUNNING_TOTAL[stage];
}

/**
 * Derive a team's furthest stage from match data.
 *
 * A team has "reached" round X if they appear as home or away in any match of
 * that round (regardless of whether they won it). "WON" requires the team to
 * be marked as the tournament winner explicitly.
 */
export function deriveDarkHorseStage(
    teamId: number,
    args: {
        matches: { round: Round; homeTeamId: number | null; awayTeamId: number | null }[];
        winnerTeamIds: number[];
    },
): DarkHorseStage {
    if (args.winnerTeamIds.includes(teamId)) {
        return "WON";
    }
    const reached = new Set<Round>();
    for (const m of args.matches) {
        if (m.homeTeamId === teamId || m.awayTeamId === teamId) {
            reached.add(m.round);
        }
    }
    if (reached.has("FINAL")) {
        return "INTO_FINAL";
    }
    if (reached.has("SF")) {
        return "INTO_SF";
    }
    if (reached.has("QF")) {
        return "INTO_QF";
    }
    if (reached.has("R16")) {
        return "INTO_R16";
    }
    if (reached.has("R32")) {
        return "INTO_R32";
    }
    return "OUT_IN_GROUPS";
}

// ---------------------------------------------------------------------------
// Bonus point computation
//
// Pure function from picks + admin-set resolutions → points-per-player.
// The leaderboard runs this on every read; cheap at our scale (~12 players).
// ---------------------------------------------------------------------------

export type BonusKind =
    | "WINNER"
    | "TOP_SCORER"
    | "MOST_ASSISTS"
    | "GROUP_WINNER"
    | "DARK_HORSE"
    | "WOODEN_SPOON"
    | "PANTOMIME_VILLAIN"
    | "SIEVE"
    | "MIGHTY_FALLEN";

export interface BonusPickLite {
    playerId: number;
    kind: BonusKind;
    groupLetter: string | null;
    teamId: number | null;
    playerName: string | null;
}

export interface BonusResolutionLite {
    kind: BonusKind;
    groupLetter: string; // "" for non-group bonuses
    teamIds: number[];
    playerNames: string[];
}

export interface BonusComputeInput {
    picks: BonusPickLite[];
    resolutions: BonusResolutionLite[];
    matches: { round: Round; homeTeamId: number | null; awayTeamId: number | null }[];
}

function normalizeName(s: string): string {
    // NFD-decompose, strip combining marks, collapse whitespace, casefold.
    // Mirrors lib/players.ts so a TOP_SCORER pick stored as "MBAPPÉ Kylian"
    // matches an admin resolution typed as "Mbappe Kylian" or "Kylian Mbappé".
    return s
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase();
}

export interface BonusBreakdownEntry {
    kind: BonusKind;
    groupLetter: string | null;
    label: string;
    pick: string;
    points: number;
}

export function computeBonusBreakdownByPlayer(
    input: BonusComputeInput & {
        teamLookup?: Map<number, { name: string }>;
    },
): Map<number, BonusBreakdownEntry[]> {
    const resByKey = new Map<string, BonusResolutionLite>();
    for (const r of input.resolutions) {
        resByKey.set(`${r.kind}:${r.groupLetter}`, r);
    }
    const winner = resByKey.get("WINNER:");

    const breakdownByPlayer = new Map<number, BonusBreakdownEntry[]>();
    const append = (playerId: number, entry: BonusBreakdownEntry): void => {
        let arr = breakdownByPlayer.get(playerId);
        if (arr === undefined) {
            arr = [];
            breakdownByPlayer.set(playerId, arr);
        }
        arr.push(entry);
    };

    const teamName = (teamId: number): string =>
        input.teamLookup?.get(teamId)?.name ?? `Team #${teamId}`;

    const LABELS: Record<string, string> = {
        WINNER: "Tournament winner",
        TOP_SCORER: "Golden Boot",
        MOST_ASSISTS: "Most assists",
        GROUP_WINNER: "Group winner",
        DARK_HORSE: "Dark horse",
        WOODEN_SPOON: "Wooden spoon",
        PANTOMIME_VILLAIN: "Pantomime villain",
        SIEVE: "The Sieve",
        MIGHTY_FALLEN: "Mighty fallen",
    };

    for (const pick of input.picks) {
        const label = pick.kind === "GROUP_WINNER"
            ? `Group ${pick.groupLetter} winner`
            : (LABELS[pick.kind] ?? pick.kind);
        const pickDesc = pick.teamId !== null
            ? teamName(pick.teamId)
            : (pick.playerName ?? "?");

        switch (pick.kind) {
            case "WINNER": {
                const hit = pick.teamId !== null && winner !== undefined && winner.teamIds.includes(pick.teamId);
                append(pick.playerId, { kind: pick.kind, groupLetter: null, label, pick: pickDesc, points: hit ? BONUS_POINTS.WINNER : 0 });
                break;
            }
            case "TOP_SCORER": {
                const r = resByKey.get("TOP_SCORER:");
                let pts = 0;
                if (r !== undefined && pick.playerName !== null) {
                    const norm = normalizeName(pick.playerName);
                    if (r.playerNames.some((n) => normalizeName(n) === norm)) {
                        pts = BONUS_POINTS.TOP_SCORER;
                    }
                }
                append(pick.playerId, { kind: pick.kind, groupLetter: null, label, pick: pickDesc, points: pts });
                break;
            }
            case "MOST_ASSISTS": {
                const r = resByKey.get("MOST_ASSISTS:");
                let pts = 0;
                if (r !== undefined && pick.playerName !== null) {
                    const norm = normalizeName(pick.playerName);
                    if (r.playerNames.some((n) => normalizeName(n) === norm)) {
                        pts = BONUS_POINTS.MOST_ASSISTS;
                    }
                }
                append(pick.playerId, { kind: pick.kind, groupLetter: null, label, pick: pickDesc, points: pts });
                break;
            }
            case "GROUP_WINNER": {
                const r = resByKey.get(`GROUP_WINNER:${pick.groupLetter ?? ""}`);
                const hit = r !== undefined && pick.teamId !== null && r.teamIds.includes(pick.teamId);
                append(pick.playerId, { kind: pick.kind, groupLetter: pick.groupLetter, label, pick: pickDesc, points: hit ? BONUS_POINTS.GROUP_WINNER : 0 });
                break;
            }
            case "WOODEN_SPOON": {
                const r = resByKey.get("WOODEN_SPOON:");
                const hit = r !== undefined && pick.teamId !== null && r.teamIds.includes(pick.teamId);
                append(pick.playerId, { kind: pick.kind, groupLetter: null, label, pick: pickDesc, points: hit ? BONUS_POINTS.WOODEN_SPOON : 0 });
                break;
            }
            case "PANTOMIME_VILLAIN": {
                const r = resByKey.get("PANTOMIME_VILLAIN:");
                const hit = r !== undefined && pick.teamId !== null && r.teamIds.includes(pick.teamId);
                append(pick.playerId, { kind: pick.kind, groupLetter: null, label, pick: pickDesc, points: hit ? BONUS_POINTS.PANTOMIME_VILLAIN : 0 });
                break;
            }
            case "SIEVE": {
                const r = resByKey.get("SIEVE:");
                const hit = r !== undefined && pick.teamId !== null && r.teamIds.includes(pick.teamId);
                append(pick.playerId, { kind: pick.kind, groupLetter: null, label, pick: pickDesc, points: hit ? BONUS_POINTS.SIEVE : 0 });
                break;
            }
            case "MIGHTY_FALLEN": {
                const r = resByKey.get("MIGHTY_FALLEN:");
                const hit = r !== undefined && pick.teamId !== null && r.teamIds.includes(pick.teamId);
                append(pick.playerId, { kind: pick.kind, groupLetter: null, label, pick: pickDesc, points: hit ? BONUS_POINTS.MIGHTY_FALLEN : 0 });
                break;
            }
            case "DARK_HORSE": {
                if (pick.teamId === null) {
                    break;
                }
                const stage = deriveDarkHorseStage(pick.teamId, {
                    matches: input.matches,
                    winnerTeamIds: winner?.teamIds ?? [],
                });
                const stageLabel = DARK_HORSE_STAGE_LABEL[stage];
                const dhLabel = stage === "OUT_IN_GROUPS"
                    ? "Dark horse (out in groups)"
                    : `Dark horse (${stageLabel})`;
                append(pick.playerId, { kind: pick.kind, groupLetter: null, label: dhLabel, pick: pickDesc, points: darkHorsePoints(stage) });
                break;
            }
        }
    }

    return breakdownByPlayer;
}

export function computeBonusPointsByPlayer(input: BonusComputeInput): Map<number, number> {
    // Index resolutions for cheap lookup.
    const resByKey = new Map<string, BonusResolutionLite>();
    for (const r of input.resolutions) {
        resByKey.set(`${r.kind}:${r.groupLetter}`, r);
    }
    const winner = resByKey.get("WINNER:");

    const pointsByPlayer = new Map<number, number>();
    const credit = (playerId: number, pts: number): void => {
        pointsByPlayer.set(playerId, (pointsByPlayer.get(playerId) ?? 0) + pts);
    };

    for (const pick of input.picks) {
        switch (pick.kind) {
            case "WINNER": {
                if (
                    pick.teamId !== null &&
                    winner !== undefined &&
                    winner.teamIds.includes(pick.teamId)
                ) {
                    credit(pick.playerId, BONUS_POINTS.WINNER);
                }
                break;
            }
            case "TOP_SCORER": {
                const r = resByKey.get("TOP_SCORER:");
                if (r !== undefined && pick.playerName !== null) {
                    const norm = normalizeName(pick.playerName);
                    if (r.playerNames.some((n) => normalizeName(n) === norm)) {
                        credit(pick.playerId, BONUS_POINTS.TOP_SCORER);
                    }
                }
                break;
            }
            case "MOST_ASSISTS": {
                const r = resByKey.get("MOST_ASSISTS:");
                if (r !== undefined && pick.playerName !== null) {
                    const norm = normalizeName(pick.playerName);
                    if (r.playerNames.some((n) => normalizeName(n) === norm)) {
                        credit(pick.playerId, BONUS_POINTS.MOST_ASSISTS);
                    }
                }
                break;
            }
            case "GROUP_WINNER": {
                const r = resByKey.get(`GROUP_WINNER:${pick.groupLetter ?? ""}`);
                if (r !== undefined && pick.teamId !== null && r.teamIds.includes(pick.teamId)) {
                    credit(pick.playerId, BONUS_POINTS.GROUP_WINNER);
                }
                break;
            }
            case "WOODEN_SPOON": {
                const r = resByKey.get("WOODEN_SPOON:");
                if (r !== undefined && pick.teamId !== null && r.teamIds.includes(pick.teamId)) {
                    credit(pick.playerId, BONUS_POINTS.WOODEN_SPOON);
                }
                break;
            }
            case "PANTOMIME_VILLAIN": {
                const r = resByKey.get("PANTOMIME_VILLAIN:");
                if (r !== undefined && pick.teamId !== null && r.teamIds.includes(pick.teamId)) {
                    credit(pick.playerId, BONUS_POINTS.PANTOMIME_VILLAIN);
                }
                break;
            }
            case "SIEVE": {
                const r = resByKey.get("SIEVE:");
                if (r !== undefined && pick.teamId !== null && r.teamIds.includes(pick.teamId)) {
                    credit(pick.playerId, BONUS_POINTS.SIEVE);
                }
                break;
            }
            case "MIGHTY_FALLEN": {
                const r = resByKey.get("MIGHTY_FALLEN:");
                if (r !== undefined && pick.teamId !== null && r.teamIds.includes(pick.teamId)) {
                    credit(pick.playerId, BONUS_POINTS.MIGHTY_FALLEN);
                }
                break;
            }
            case "DARK_HORSE": {
                if (pick.teamId === null) {
                    break;
                }
                const stage = deriveDarkHorseStage(pick.teamId, {
                    matches: input.matches,
                    winnerTeamIds: winner?.teamIds ?? [],
                });
                credit(pick.playerId, darkHorsePoints(stage));
                break;
            }
        }
    }

    return pointsByPlayer;
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
    matches: {
        id: number;
        round: Round;
        status: string;
        homeScore: number | null;
        awayScore: number | null;
        homeTeamId: number | null;
        awayTeamId: number | null;
        winnerTeamId: number | null;
    }[];
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
            // Belt-and-braces: standings only ever credit FINISHED matches.
            // predictionPoints/isExact also gate on this, but enforcing it
            // here means a future caller that forgets to plumb `status`
            // through can't accidentally award provisional points against
            // a running scoreline (e.g. a 2-1 pick on a match that's 2-1
            // at half-time).
            if (match.status !== "FINISHED") {
                continue;
            }
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

/**
 * Standard "1224" competition ranking by total points.
 *
 * Two players with identical `points` share a rank; the next distinct points
 * value receives `rank = (its 0-based index in the sorted list) + 1`. So if
 * positions 2 and 3 are tied at 40 pts and the player at position 4 has
 * 35 pts, ranks are 1, 2, 2, 4.
 *
 * Used for the **display rank** on the leaderboard table, the y-axis of the
 * position-over-time chart, and the ▲/▼ position-change indicators. Row
 * ordering on the table itself still uses the full tie-break comparator
 * (compareLeaderboardRows) so a player who is "ahead on tie-breaks" appears
 * above a tied opponent — but they share a rank number.
 *
 * Input must be the output of buildLeaderboard (already sorted desc by
 * points with full tie-breaks resolved).
 */
export function computePointsOnlyRank(
    rows: ReadonlyArray<PlayerLeaderboardRow>,
): Map<number, number> {
    const ranks = new Map<number, number>();
    let currentRank = 1;
    let lastPoints: number | null = null;
    rows.forEach((row, index) => {
        if (lastPoints === null || row.points !== lastPoints) {
            currentRank = index + 1;
            lastPoints = row.points;
        }
        ranks.set(row.playerId, currentRank);
    });
    return ranks;
}
