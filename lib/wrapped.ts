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

export interface BestCall {
    matchId: number;
    points: number;
    exact: boolean;
    boldness: number;
    kickoff: Date;
}

export interface WorstCall {
    matchId: number;
    missMargin: number;
    wrongOutcome: boolean;
    kickoff: Date;
}

/** Fraction of filers who did NOT share this pick's outcome. 0..1, higher = bolder. */
export function computeBoldness(
    playerId: number,
    matchId: number,
    predictions: WrappedPrediction[],
): number {
    const filers = predictions.filter((p) => p.matchId === matchId);
    if (filers.length === 0) {
        return 0;
    }
    const mine = filers.find((p) => p.playerId === playerId);
    if (mine === undefined) {
        return 0;
    }
    const myOutcome = outcome(mine);
    const sharing = filers.filter((p) => outcome(p) === myOutcome).length;
    return 1 - sharing / filers.length;
}

function isBetterCall(a: BestCall, b: BestCall): boolean {
    if (a.points !== b.points) {
        return a.points > b.points;
    }
    if (a.exact !== b.exact) {
        return a.exact;
    }
    if (a.boldness !== b.boldness) {
        return a.boldness > b.boldness;
    }
    return a.kickoff.getTime() > b.kickoff.getTime();
}

export function findBestCall(
    playerId: number,
    input: { matches: WrappedMatch[]; predictions: WrappedPrediction[] },
): BestCall | null {
    const byId = new Map(settledMatches(input.matches).map((m) => [m.id, m]));
    const mine = input.predictions.filter(
        (p) => p.playerId === playerId && byId.has(p.matchId),
    );
    let best: BestCall | null = null;
    for (const p of mine) {
        const m = byId.get(p.matchId)!;
        const points = predictionPoints(m, p);
        if (points === 0) {
            continue;
        }
        const cand: BestCall = {
            matchId: m.id,
            points,
            exact: isExact(m, p),
            boldness: computeBoldness(playerId, m.id, input.predictions),
            kickoff: m.kickoff,
        };
        if (best === null || isBetterCall(cand, best)) {
            best = cand;
        }
    }
    return best;
}

export function findWorstCall(
    playerId: number,
    input: { matches: WrappedMatch[]; predictions: WrappedPrediction[] },
): WorstCall | null {
    const byId = new Map(settledMatches(input.matches).map((m) => [m.id, m]));
    const mine = input.predictions.filter(
        (p) => p.playerId === playerId && byId.has(p.matchId),
    );
    let worst: WorstCall | null = null;
    for (const p of mine) {
        const m = byId.get(p.matchId)!;
        if (predictionPoints(m, p) > 0) {
            continue; // only wrong picks
        }
        const missMargin =
            Math.abs(p.homeScore - m.homeScore!) + Math.abs(p.awayScore - m.awayScore!);
        const cand: WorstCall = {
            matchId: m.id,
            missMargin,
            wrongOutcome:
                outcome(p) !==
                outcome({ homeScore: m.homeScore!, awayScore: m.awayScore! }),
            kickoff: m.kickoff,
        };
        if (worst === null || cand.missMargin > worst.missMargin) {
            worst = cand;
        }
    }
    return worst;
}
