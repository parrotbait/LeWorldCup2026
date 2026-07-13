/**
 * Pure engine for World Cup Wrapped. No DB, no I/O — all inputs come from the
 * caller (the leaderboard page already loads them). Mirrors lib/scoring.ts so
 * the whole thing is deterministic and unit-testable.
 *
 * Spec: docs/superpowers/specs/2026-07-13-world-cup-wrapped-design.md
 */
import type { BonusResolutionLite, Round } from "./scoring";
import { isExact, outcome, predictionPoints } from "./scoring";

/** FINAL match played to a finish. */
export function isTournamentComplete(
    matches: { round: Round; status: string }[],
): boolean {
    const final = matches.find((m) => m.round === "FINAL");
    return final !== undefined && final.status === "FINISHED";
}

/**
 * Wrapped unlocks only when the tournament is complete AND the terminal
 * admin-set bonus (WINNER) is resolved — otherwise bonus/persona cards would
 * show a false "0 bonuses landed". See spec §2.
 */
export function isWrappedUnlocked(
    matches: { round: Round; status: string }[],
    resolutions: Pick<BonusResolutionLite, "kind" | "teamIds">[],
): boolean {
    if (!isTournamentComplete(matches)) {
        return false;
    }
    return resolutions.some((r) => r.kind === "WINNER" && r.teamIds.length > 0);
}

export type PersonaKey =
    | "EARLY_RETIREMENT"
    | "CHAMPION"
    | "WOODEN_SPOON"
    | "STEADY_EDDIE"
    | "ORACLE"
    | "SNIPER"
    | "CONTRARIAN"
    | "MAVERICK"
    | "CHANCER"
    | "BONUS_MERCHANT"
    | "PROPHET"
    | "DARK_HORSE_WHISPERER"
    | "CLOSER"
    | "FAST_STARTER"
    | "COMEBACK"
    | "FRONTRUNNER"
    | "OPTIMIST"
    | "CAGEY_ONE"
    | "METRONOME"
    | "NEARLY_MAN";

export interface WrappedMatch {
    id: number;
    round: Round;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    homeTeamId: number | null;
    awayTeamId: number | null;
    winnerTeamId: number | null;
    kickoff: Date;
    groupLetter: string | null;
}

export interface WrappedPrediction {
    playerId: number;
    matchId: number;
    homeScore: number;
    awayScore: number;
}

export interface PlayerStats {
    filed: number;
    settledFinished: number;
    participationRate: number;
    scoredPreds: number;
    exactCount: number;
    hitRate: number;
    exactRate: number;
    predPoints: number;
    perMatchPoints: number;
    drawShare: number;
    meanPredGoals: number;
    groupPointsShare: number;
    knockoutPicks: number;
    knockoutCorrect: number;
}

const FINISHED = "FINISHED";

/** Only FINISHED matches with both scores set are "settled" for Wrapped stats. */
function settledMatches(matches: WrappedMatch[]): WrappedMatch[] {
    return matches.filter(
        (m) => m.status === FINISHED && m.homeScore !== null && m.awayScore !== null,
    );
}

export function computePlayerStats(
    playerId: number,
    input: { matches: WrappedMatch[]; predictions: WrappedPrediction[] },
): PlayerStats {
    const settled = settledMatches(input.matches);
    const byId = new Map(settled.map((m) => [m.id, m]));
    const mine = input.predictions.filter(
        (p) => p.playerId === playerId && byId.has(p.matchId),
    );

    let scoredPreds = 0;
    let exactCount = 0;
    let predPoints = 0;
    let draws = 0;
    let predGoals = 0;
    let groupPoints = 0;
    let knockoutPicks = 0;
    let knockoutCorrect = 0;

    for (const p of mine) {
        const m = byId.get(p.matchId)!;
        const pts = predictionPoints(m, p);
        predPoints += pts;
        if (pts > 0) {
            scoredPreds += 1;
        }
        if (isExact(m, p)) {
            exactCount += 1;
        }
        if (outcome(p) === "DRAW") {
            draws += 1;
        }
        predGoals += p.homeScore + p.awayScore;
        if (m.round === "GROUP") {
            groupPoints += pts;
        } else {
            knockoutPicks += 1;
            if (pts > 0) {
                knockoutCorrect += 1;
            }
        }
    }

    const filed = mine.length;
    const settledFinished = settled.length;
    const safe = (num: number, den: number): number => (den === 0 ? 0 : num / den);

    return {
        filed,
        settledFinished,
        participationRate: safe(filed, settledFinished),
        scoredPreds,
        exactCount,
        hitRate: safe(scoredPreds, filed),
        exactRate: safe(exactCount, filed),
        predPoints,
        perMatchPoints: safe(predPoints, filed),
        drawShare: safe(draws, filed),
        meanPredGoals: safe(predGoals, filed),
        groupPointsShare: safe(groupPoints, predPoints),
        knockoutPicks,
        knockoutCorrect,
    };
}
