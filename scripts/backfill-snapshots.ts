/**
 * Backfill historical leaderboard snapshots from match data.
 *
 * The tournament started without snapshot capture. This script replays every
 * FINISHED match in chronological order, computing the leaderboard state as
 * of each match's `kickoff + 110m` and inserting one MATCH snapshot per. It
 * also inserts a synthetic TOURNAMENT_START anchor at the opening match's
 * kickoff so the chart has a clean leftmost vertex with everyone tied at 1.
 *
 * Usage:
 *
 *   pnpm backfill:snapshots               → idempotency-guarded; aborts if any
 *                                            leaderboard_snapshots rows exist.
 *   pnpm backfill:snapshots --force       → wipes existing snapshots and rebuilds.
 *
 * Run inside a single transaction so a partial backfill can't leave
 * half-state behind.
 */

import "./_load-env";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import {
    leaderboardSnapshotRows,
    leaderboardSnapshots,
    matches as matchesTable,
} from "../db/schema";
import {
    SNAPSHOT_OFFSET_MS,
    computeSnapshotState,
    loadSnapshotInput,
    snapshotMatchesAsOf,
    writeSnapshot,
    type SnapshotPlayerState,
} from "../lib/snapshot";

async function main(): Promise<void> {
    const force = process.argv.includes("--force");

    const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leaderboardSnapshots);

    if (count > 0 && !force) {
        console.error(
            `Refusing to backfill — ${count} snapshot rows already exist. ` +
                `Re-run with --force to wipe and rebuild.`,
        );
        process.exit(1);
    }

    if (force && count > 0) {
        console.log(`Wiping ${count} existing snapshot rows...`);
        await db.delete(leaderboardSnapshotRows);
        await db.delete(leaderboardSnapshots);
    }

    // Read everything we need ONCE; the replay loop only varies the cutoff.
    const base = await loadSnapshotInput();
    const matchKickoffs = await db
        .select({ id: matchesTable.id, kickoff: matchesTable.kickoff, status: matchesTable.status })
        .from(matchesTable)
        .orderBy(matchesTable.kickoff);

    if (matchKickoffs.length === 0) {
        console.error("No matches in the database — cannot backfill.");
        process.exit(1);
    }

    const finishedInOrder = matchKickoffs.filter((m) => m.status === "FINISHED");
    const tournamentKickoff = matchKickoffs[0]!.kickoff;
    const matchesWithKickoff = base.matches.map((m) => ({
        ...m,
        kickoff: matchKickoffs.find((row) => row.id === m.id)?.kickoff ?? new Date(0),
    }));

    console.log(
        `Backfill: ${base.players.length} players, ${matchKickoffs.length} matches ` +
            `(${finishedInOrder.length} FINISHED). Tournament kickoff: ${tournamentKickoff.toISOString()}.`,
    );

    await db.transaction(async (tx) => {
        // Synthetic anchor — everyone tied at rank 1, 0 points.
        const anchorState: SnapshotPlayerState[] = base.players.map((p) => ({
            playerId: p.id,
            rank: 1,
            points: 0,
            bonusPoints: 0,
        }));
        await writeSnapshot({
            capturedAt: tournamentKickoff,
            causeKind: "TOURNAMENT_START",
            causeMatchId: null,
            causeBonusKind: null,
            state: anchorState,
            priorState: null,
            tx,
        });
        console.log(`  ✓ TOURNAMENT_START anchor at ${tournamentKickoff.toISOString()}`);

        let priorState: SnapshotPlayerState[] = anchorState;

        for (const m of finishedInOrder) {
            const filtered = snapshotMatchesAsOf(matchesWithKickoff, m.kickoff);
            const state = computeSnapshotState({
                ...base,
                matches: filtered.map((row) => ({
                    id: row.id,
                    round: row.round,
                    status: row.status,
                    homeScore: row.homeScore,
                    awayScore: row.awayScore,
                    homeTeamId: row.homeTeamId,
                    awayTeamId: row.awayTeamId,
                    winnerTeamId: row.winnerTeamId,
                })),
            });
            const capturedAt = new Date(m.kickoff.getTime() + SNAPSHOT_OFFSET_MS);
            await writeSnapshot({
                capturedAt,
                causeKind: "MATCH",
                causeMatchId: m.id,
                causeBonusKind: null,
                state,
                priorState,
                tx,
            });
            priorState = state;
            console.log(
                `  ✓ MATCH ${m.id} @ ${capturedAt.toISOString()}`,
            );
        }
    });

    console.log(`Done. Wrote ${1 + finishedInOrder.length} snapshots.`);
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
