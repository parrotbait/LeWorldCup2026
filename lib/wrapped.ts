/**
 * Pure engine for World Cup Wrapped. No DB, no I/O — all inputs come from the
 * caller (the leaderboard page already loads them). Mirrors lib/scoring.ts so
 * the whole thing is deterministic and unit-testable.
 *
 * Spec: docs/superpowers/specs/2026-07-13-world-cup-wrapped-design.md
 */
import type { BonusResolutionLite, Round } from "./scoring";

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
