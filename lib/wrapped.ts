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

export interface PersonaInput {
    playerId: number;
    finalRank: number;
    lastRank: number;
    participationRate: number;
    filed: number;
    exactCount: number;
    perMatchPoints: number;
    bonusPoints: number;
    predPoints: number;
    darkHorsePoints: number;
    wonBonusWinner: boolean;
    knockoutCorrect: number;
    knockoutPicks: number;
    groupPointsShare: number;
    meanPredGoals: number;
    drawShare: number;
    bestBoldness: number;
    snapshotsLed: number;
    rankClimb: number;
}

const MIN_FILED_FOR_RATE = 5;

/** An allocatable persona: eligibility gate + a signature score (higher = better fit). */
interface AllocatablePersona {
    key: PersonaKey;
    eligible: (p: PersonaInput) => boolean;
    score: (p: PersonaInput) => number;
}

const ALLOCATABLE: AllocatablePersona[] = [
    { key: "ORACLE", eligible: (p) => p.filed >= MIN_FILED_FOR_RATE && p.exactCount >= 3, score: (p) => p.exactCount },
    { key: "SNIPER", eligible: (p) => p.filed >= MIN_FILED_FOR_RATE, score: (p) => p.perMatchPoints },
    { key: "CONTRARIAN", eligible: (p) => p.knockoutCorrect + p.exactCount > 0, score: (p) => p.bestBoldness },
    { key: "MAVERICK", eligible: (p) => p.filed >= MIN_FILED_FOR_RATE, score: (p) => p.bestBoldness },
    { key: "CHANCER", eligible: (p) => p.filed >= MIN_FILED_FOR_RATE, score: (p) => p.meanPredGoals },
    { key: "BONUS_MERCHANT", eligible: (p) => p.bonusPoints > 0, score: (p) => p.bonusPoints },
    { key: "PROPHET", eligible: (p) => p.wonBonusWinner, score: () => 1 },
    { key: "DARK_HORSE_WHISPERER", eligible: (p) => p.darkHorsePoints > 0, score: (p) => p.darkHorsePoints },
    { key: "CLOSER", eligible: (p) => p.knockoutPicks >= 3, score: (p) => p.knockoutCorrect / Math.max(1, p.knockoutPicks) },
    { key: "FAST_STARTER", eligible: (p) => p.filed >= MIN_FILED_FOR_RATE, score: (p) => p.groupPointsShare },
    { key: "COMEBACK", eligible: (p) => p.rankClimb > 0, score: (p) => p.rankClimb },
    { key: "FRONTRUNNER", eligible: (p) => p.snapshotsLed > 0 && p.finalRank !== 1, score: (p) => p.snapshotsLed },
    { key: "OPTIMIST", eligible: (p) => p.filed >= MIN_FILED_FOR_RATE, score: (p) => p.meanPredGoals },
    { key: "CAGEY_ONE", eligible: (p) => p.filed >= MIN_FILED_FOR_RATE, score: (p) => p.drawShare },
    { key: "METRONOME", eligible: (p) => p.participationRate >= 0.9, score: (p) => p.perMatchPoints * (1 - p.drawShare) },
    { key: "NEARLY_MAN", eligible: (p) => p.finalRank === 2 || p.finalRank === 3, score: (p) => 4 - p.finalRank },
];

/**
 * Assign exactly one persona per player. Reserved personas first, then a
 * deterministic greedy allocation of the strongest (player, persona) pair.
 * Each allocatable persona is used at most once. See spec §3.2.
 */
export function allocatePersonas(inputs: PersonaInput[]): Map<number, PersonaKey> {
    const sorted = [...inputs].sort((a, b) => a.playerId - b.playerId);
    const result = new Map<number, PersonaKey>();
    const remaining: PersonaInput[] = [];

    // Step 1 — reserved.
    for (const p of sorted) {
        if (p.participationRate < 0.25) {
            result.set(p.playerId, "EARLY_RETIREMENT");
        } else if (p.finalRank === 1) {
            result.set(p.playerId, "CHAMPION");
        } else if (p.finalRank === p.lastRank && p.participationRate >= 0.5) {
            result.set(p.playerId, "WOODEN_SPOON");
        } else {
            remaining.push(p);
        }
    }

    // Step 2 — greedy allocation.
    const available = new Set(ALLOCATABLE.map((a) => a.key));
    const unplaced = new Set(remaining.map((p) => p.playerId));
    const byId = new Map(remaining.map((p) => [p.playerId, p]));

    while (unplaced.size > 0) {
        let bestPair: { playerId: number; key: PersonaKey; score: number } | null = null;
        for (const playerId of unplaced) {
            const p = byId.get(playerId)!;
            for (const persona of ALLOCATABLE) {
                if (!available.has(persona.key) || !persona.eligible(p)) {
                    continue;
                }
                const score = persona.score(p);
                if (
                    bestPair === null ||
                    score > bestPair.score ||
                    // Deterministic tie-break: lower playerId, then catalogue order.
                    (score === bestPair.score && playerId < bestPair.playerId)
                ) {
                    bestPair = { playerId, key: persona.key, score };
                }
            }
        }
        if (bestPair === null) {
            // No eligible persona left for anyone — catch-all.
            for (const playerId of unplaced) {
                result.set(playerId, "STEADY_EDDIE");
            }
            break;
        }
        result.set(bestPair.playerId, bestPair.key);
        available.delete(bestPair.key);
        unplaced.delete(bestPair.playerId);
    }

    return result;
}
