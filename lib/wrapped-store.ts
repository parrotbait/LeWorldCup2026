/**
 * Server-only helpers for the frozen Wrapped payload. Builds the payload from
 * live data once (via buildWrapped), persists it, and serves it thereafter.
 * See docs/superpowers/specs/2026-07-13-world-cup-wrapped-design.md §6.3.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
    bonusPicks,
    bonusResolutions,
    jokers,
    leaderboardSnapshotRows,
    leaderboardSnapshots,
    matches,
    players,
    playerWrapped,
    predictions,
    teams,
} from "@/db/schema";
import {
    buildLeaderboard,
    computeBonusBreakdownByPlayer,
    computeBonusPointsByPlayer,
} from "@/lib/scoring";
import {
    buildWrapped,
    isWrappedUnlocked,
    type WrappedData,
    type WrappedInput,
} from "@/lib/wrapped";

/** Load everything buildWrapped needs and produce the full per-player map. */
async function computeAllWrapped(): Promise<Map<number, WrappedData>> {
    const [
        allPlayers,
        allMatches,
        allPredictions,
        allJokers,
        allBonusPicks,
        allResolutions,
        allTeams,
        allSnapshots,
        allSnapshotRows,
    ] = await Promise.all([
        db.select().from(players),
        db.select().from(matches),
        db.select().from(predictions),
        db.select().from(jokers),
        db.select().from(bonusPicks),
        db.select().from(bonusResolutions),
        db.select().from(teams),
        db
            .select({ id: leaderboardSnapshots.id, capturedAt: leaderboardSnapshots.capturedAt })
            .from(leaderboardSnapshots)
            .orderBy(asc(leaderboardSnapshots.capturedAt), asc(leaderboardSnapshots.id)),
        db
            .select({
                snapshotId: leaderboardSnapshotRows.snapshotId,
                playerId: leaderboardSnapshotRows.playerId,
                rank: leaderboardSnapshotRows.rank,
                points: leaderboardSnapshotRows.points,
            })
            .from(leaderboardSnapshotRows),
    ]);

    const picks = allBonusPicks.map((b) => ({
        playerId: b.playerId,
        kind: b.kind,
        groupLetter: b.groupLetter,
        teamId: b.teamId,
        playerName: b.playerName,
    }));
    const resolutions = allResolutions.map((r) => ({
        kind: r.kind,
        groupLetter: r.groupLetter,
        teamIds: r.teamIds,
        playerNames: r.playerNames,
    }));
    const bonusMatches = allMatches.map((m) => ({
        round: m.round,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
    }));

    const bonusPointsByPlayer = computeBonusPointsByPlayer({
        picks,
        resolutions,
        matches: bonusMatches,
    });
    const bonusBreakdownByPlayer = computeBonusBreakdownByPlayer({
        picks,
        resolutions,
        matches: bonusMatches,
        teamLookup: new Map(allTeams.map((t) => [t.id, { name: t.name }])),
    });

    const leaderboardRows = buildLeaderboard({
        players: allPlayers.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            joinedAt: p.joinedAt,
        })),
        matches: allMatches.map((m) => ({
            id: m.id,
            round: m.round,
            status: m.status,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            winnerTeamId: m.winnerTeamId,
        })),
        predictions: allPredictions.map((p) => ({
            playerId: p.playerId,
            matchId: p.matchId,
            homeScore: p.homeScore,
            awayScore: p.awayScore,
        })),
        jokers: allJokers.map((j) => ({
            playerId: j.playerId,
            round: j.round,
            matchId: j.matchId,
        })),
        bonusPointsByPlayer,
    });

    const rowsBySnapshot = new Map<number, Record<number, { rank: number; points: number }>>();
    for (const r of allSnapshotRows) {
        let bucket = rowsBySnapshot.get(r.snapshotId);
        if (bucket === undefined) {
            bucket = {};
            rowsBySnapshot.set(r.snapshotId, bucket);
        }
        bucket[r.playerId] = { rank: r.rank, points: r.points };
    }
    const snapshotSeries = allSnapshots.map((s) => ({
        capturedAt: s.capturedAt.getTime(),
        rowsByPlayerId: rowsBySnapshot.get(s.id) ?? {},
    }));

    const wrappedInput: WrappedInput = {
        players: allPlayers.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            joinedAt: p.joinedAt,
        })),
        matches: allMatches.map((m) => ({
            id: m.id,
            round: m.round,
            status: m.status,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            winnerTeamId: m.winnerTeamId,
            kickoff: m.kickoff,
            groupLetter: m.groupLetter,
        })),
        predictions: allPredictions.map((p) => ({
            playerId: p.playerId,
            matchId: p.matchId,
            homeScore: p.homeScore,
            awayScore: p.awayScore,
        })),
        leaderboardRows,
        bonusBreakdownByPlayer,
        snapshotSeries,
        teamLookup: new Map(allTeams.map((t) => [t.id, { name: t.name, code: t.code }])),
    };

    return buildWrapped(wrappedInput);
}

/** Is Wrapped unlocked right now? (Final finished + WINNER resolved.) */
export async function wrappedUnlocked(): Promise<boolean> {
    const [allMatches, allResolutions] = await Promise.all([
        db.select({ round: matches.round, status: matches.status }).from(matches),
        db
            .select({ kind: bonusResolutions.kind, teamIds: bonusResolutions.teamIds })
            .from(bonusResolutions),
    ]);
    return isWrappedUnlocked(allMatches, allResolutions);
}

/**
 * Return the frozen Wrapped for a player, computing + persisting it on first
 * access. Returns null if the feature isn't unlocked yet.
 */
export async function getFrozenWrapped(playerId: number): Promise<WrappedData | null> {
    const existing = (
        await db.select().from(playerWrapped).where(eq(playerWrapped.playerId, playerId)).limit(1)
    )[0];
    if (existing !== undefined) {
        return JSON.parse(existing.payload) as WrappedData;
    }
    if (!(await wrappedUnlocked())) {
        return null;
    }
    // First unlock: compute all, persist all, return this player's.
    const all = await computeAllWrapped();
    const rows = [...all.values()].map((w) => ({
        playerId: w.playerId,
        payload: JSON.stringify(w),
    }));
    if (rows.length > 0) {
        await db.insert(playerWrapped).values(rows).onConflictDoNothing();
    }
    return all.get(playerId) ?? null;
}

/** Has this player opened their Wrapped before? */
export async function hasSeenWrapped(playerId: number): Promise<boolean> {
    const row = (
        await db
            .select({ seenAt: playerWrapped.seenAt })
            .from(playerWrapped)
            .where(eq(playerWrapped.playerId, playerId))
            .limit(1)
    )[0];
    return row?.seenAt != null;
}

/** Mark this player's Wrapped as seen (idempotent). */
export async function markWrappedSeen(playerId: number): Promise<void> {
    await db
        .update(playerWrapped)
        .set({ seenAt: new Date() })
        .where(eq(playerWrapped.playerId, playerId));
}

/** Dev-only escape hatch used by the preview route. */
export async function computeAllWrappedForPreview(): Promise<Map<number, WrappedData>> {
    return computeAllWrapped();
}
