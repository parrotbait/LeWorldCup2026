import type { SnapshotPlayerState } from "./snapshot";

export interface MatchState {
    id: number;
    externalId: number | null;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    homeName: string | null;
    awayName: string | null;
}

export interface MatchDiff {
    matchId: number;
    externalId: number | null;
    label: string;
    oldStatus: string;
    newStatus: string;
    oldScore: string | null;
    newScore: string | null;
}

export interface PlayerImpact {
    playerId: number;
    displayName: string;
    oldPoints: number;
    newPoints: number;
    pointsDelta: number;
    oldBonusPoints: number;
    newBonusPoints: number;
    bonusDelta: number;
}

export interface SyncAuditTrail {
    matchDiffs: MatchDiff[];
    playerImpacts: PlayerImpact[];
    regressions: PlayerImpact[];
    hasRegression: boolean;
}

function formatScore(home: number | null, away: number | null): string | null {
    if (home === null || away === null) {
        return null;
    }
    return `${home}-${away}`;
}

export function buildMatchDiffs(
    before: MatchState[],
    after: MatchState[],
): MatchDiff[] {
    const beforeById = new Map(before.map((m) => [m.id, m]));
    const diffs: MatchDiff[] = [];

    for (const a of after) {
        const b = beforeById.get(a.id);
        const oldStatus = b?.status ?? "NEW";
        const oldScore = b !== undefined ? formatScore(b.homeScore, b.awayScore) : null;
        const newScore = formatScore(a.homeScore, a.awayScore);

        if (oldStatus !== a.status || oldScore !== newScore) {
            const label = `${a.homeName ?? "TBD"} vs ${a.awayName ?? "TBD"}`;
            diffs.push({
                matchId: a.id,
                externalId: a.externalId,
                label,
                oldStatus,
                newStatus: a.status,
                oldScore,
                newScore,
            });
        }
    }

    return diffs;
}

export function buildPlayerImpacts(
    before: SnapshotPlayerState[],
    after: SnapshotPlayerState[],
    displayNames: Map<number, string>,
): PlayerImpact[] {
    const beforeByPlayer = new Map(before.map((s) => [s.playerId, s]));

    return after.map((a) => {
        const b = beforeByPlayer.get(a.playerId);
        return {
            playerId: a.playerId,
            displayName: displayNames.get(a.playerId) ?? `Player #${a.playerId}`,
            oldPoints: b?.points ?? 0,
            newPoints: a.points,
            pointsDelta: a.points - (b?.points ?? 0),
            oldBonusPoints: b?.bonusPoints ?? 0,
            newBonusPoints: a.bonusPoints,
            bonusDelta: a.bonusPoints - (b?.bonusPoints ?? 0),
        };
    });
}

export function buildSyncAuditTrail(
    matchesBefore: MatchState[],
    matchesAfter: MatchState[],
    stateBefore: SnapshotPlayerState[],
    stateAfter: SnapshotPlayerState[],
    displayNames: Map<number, string>,
): SyncAuditTrail {
    const matchDiffs = buildMatchDiffs(matchesBefore, matchesAfter);
    const playerImpacts = buildPlayerImpacts(stateBefore, stateAfter, displayNames);
    const regressions = playerImpacts.filter((p) => p.pointsDelta < 0);

    return {
        matchDiffs,
        playerImpacts,
        regressions,
        hasRegression: regressions.length > 0,
    };
}

export class SyncRegressionError extends Error {
    constructor(public readonly audit: SyncAuditTrail) {
        const names = audit.regressions
            .map((r) => `${r.displayName} ${r.pointsDelta}`)
            .join(", ");
        super(`Sync blocked: point regression detected (${names}). Set SYNC_FORCE=1 to override.`);
        this.name = "SyncRegressionError";
    }
}
