/**
 * Leaderboard snapshot pipeline.
 *
 * A snapshot is one parent row in `leaderboard_snapshots` plus one child row
 * per player in `leaderboard_snapshot_rows`. Snapshots fire on:
 *
 *   • TOURNAMENT_START — synthetic anchor at the opening match's kickoff,
 *     all players tied at rank 1 with 0 points. Inserted by the backfill
 *     script as the chart's leftmost vertex.
 *
 *   • MATCH — once per match transitioning to FINISHED, stamped at
 *     `kickoff + 110m`. The snapshot's "points-as-of-this-match" state is
 *     computed by passing only the matches with kickoff <= this match's
 *     kickoff and status = FINISHED to buildLeaderboard, so each MATCH
 *     snapshot is a faithful prefix-replay.
 *
 *   • BONUS — once per `bonusResolutions` save that actually changed the
 *     resolved teams/players. Stamped at the moment of save.
 *
 *   • CORRECTION — once per previously-finished match whose score changes
 *     after the fact. Stamped at the moment the correction is detected.
 *
 * The chart and the leaderboard's ▲/▼ indicators consume these rows.
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
    auditLog,
    bonusPicks as bonusPicksTable,
    bonusResolutions as bonusResolutionsTable,
    jokers as jokersTable,
    leaderboardSnapshotRows,
    leaderboardSnapshots,
    matches as matchesTable,
    players as playersTable,
    predictions as predictionsTable,
} from "@/db/schema";
import {
    buildLeaderboard,
    computeBonusPointsByPlayer,
    computePointsOnlyRank,
    type BonusPickLite,
    type BonusResolutionLite,
    type ScoringInput,
} from "./scoring";

/**
 * Snapshot stamp offset from kickoff: 110 minutes covers regulation + a
 * generous half-time + injury time + extra time + a small admin buffer. Picks
 * a deterministic "after the whistle" instant on the chart's x-axis so timing
 * is independent of cron jitter.
 */
export const SNAPSHOT_OFFSET_MS = 110 * 60 * 1000;

export type SnapshotCauseKind = "TOURNAMENT_START" | "MATCH" | "BONUS" | "CORRECTION";

export interface SnapshotPlayerState {
    playerId: number;
    rank: number;
    points: number;
    bonusPoints: number;
}

export interface SnapshotInput {
    players: ScoringInput["players"];
    matches: ScoringInput["matches"];
    predictions: ScoringInput["predictions"];
    jokers: ScoringInput["jokers"];
    bonusPicks: BonusPickLite[];
    bonusResolutions: BonusResolutionLite[];
}

/**
 * Pure: derive the snapshot state for a given view of the data. Combines
 * computeBonusPointsByPlayer, buildLeaderboard, and computePointsOnlyRank.
 *
 * To replay history, filter `matches` so that only matches that should be
 * considered FINISHED at the cutoff appear with status='FINISHED'; later
 * matches can be passed through untouched (they'll score 0 anyway).
 * snapshotMatchesAsOf below applies that filter for you.
 */
export function computeSnapshotState(input: SnapshotInput): SnapshotPlayerState[] {
    const bonusPointsByPlayer = computeBonusPointsByPlayer({
        picks: input.bonusPicks,
        resolutions: input.bonusResolutions,
        matches: input.matches.map((m) => ({
            round: m.round,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
        })),
    });
    const rows = buildLeaderboard({
        players: input.players,
        matches: input.matches,
        predictions: input.predictions,
        jokers: input.jokers,
        bonusPointsByPlayer,
    });
    const ranks = computePointsOnlyRank(rows);
    return rows.map((r) => ({
        playerId: r.playerId,
        rank: ranks.get(r.playerId) ?? 1,
        points: r.points,
        bonusPoints: r.bonusPoints,
    }));
}

/**
 * Filter the `matches` array to a moment-in-time view: any match with
 * `kickoff > cutoff` has its status forced to "SCHEDULED" so it doesn't
 * award points, and any `homeScore`/`awayScore` is masked. Used by the
 * backfill replay loop and the sync-time gap fill.
 *
 * The cutoff is inclusive: matches whose kickoff equals the cutoff are
 * treated as already finished (the snapshot timestamp is kickoff + 110m,
 * which is strictly after kickoff).
 */
export function snapshotMatchesAsOf<
    M extends {
        kickoff: Date;
        status: string;
        homeScore: number | null;
        awayScore: number | null;
    },
>(matches: M[], cutoff: Date): M[] {
    const cutoffMs = cutoff.getTime();
    return matches.map((m) => {
        if (m.kickoff.getTime() > cutoffMs) {
            return { ...m, status: "SCHEDULED", homeScore: null, awayScore: null };
        }
        return m;
    });
}

/**
 * Drizzle's transaction callback parameter type. Used so writeSnapshot can
 * either open its own transaction or join an outer one passed by the caller
 * (e.g. saveBonusResolutionAction wraps upsert + snapshot in a single tx).
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

/**
 * Persist one snapshot: parent row + one child row per player. Computes
 * `rankDelta` / `pointsDelta` against `priorState` (or 0 when there is no
 * prior — i.e. the TOURNAMENT_START anchor).
 *
 * Pass an outer `tx` to enrol in an existing transaction (e.g. so a bonus
 * upsert and its snapshot succeed-or-fail together). Without a tx the
 * function opens its own.
 */
export async function writeSnapshot(args: {
    capturedAt: Date;
    causeKind: SnapshotCauseKind;
    causeMatchId: number | null;
    causeBonusKind: string | null;
    state: SnapshotPlayerState[];
    priorState: SnapshotPlayerState[] | null;
    tx?: Tx;
}): Promise<number> {
    const childRows = buildChildRows(args.state, args.priorState);

    async function insertWith(executor: Executor): Promise<number> {
        const [parent] = await executor
            .insert(leaderboardSnapshots)
            .values({
                capturedAt: args.capturedAt,
                causeKind: args.causeKind,
                causeMatchId: args.causeMatchId,
                causeBonusKind: args.causeBonusKind,
            })
            .returning({ id: leaderboardSnapshots.id });

        if (parent === undefined) {
            throw new Error("snapshot insert returned no id");
        }

        if (childRows.length > 0) {
            await executor
                .insert(leaderboardSnapshotRows)
                .values(childRows.map((r) => ({ ...r, snapshotId: parent.id })));
        }

        return parent.id;
    }

    if (args.tx !== undefined) {
        return insertWith(args.tx);
    }
    return db.transaction((tx) => insertWith(tx));
}

/**
 * Pure: derive the child-row payload (without snapshotId) from current and
 * prior state. Exported for unit testing the delta-computation logic.
 */
export function buildChildRows(
    state: SnapshotPlayerState[],
    priorState: SnapshotPlayerState[] | null,
): Array<{
    playerId: number;
    rank: number;
    points: number;
    bonusPoints: number;
    rankDelta: number;
    pointsDelta: number;
}> {
    const priorByPlayer = new Map<number, SnapshotPlayerState>();
    if (priorState !== null) {
        for (const p of priorState) {
            priorByPlayer.set(p.playerId, p);
        }
    }
    return state.map((s) => {
        const prior = priorByPlayer.get(s.playerId);
        // rankDelta positive = moved up the table (lower rank number).
        // pointsDelta positive = gained points.
        const rankDelta = prior !== undefined ? prior.rank - s.rank : 0;
        const pointsDelta = prior !== undefined ? s.points - prior.points : 0;
        return {
            playerId: s.playerId,
            rank: s.rank,
            points: s.points,
            bonusPoints: s.bonusPoints,
            rankDelta,
            pointsDelta,
        };
    });
}

/**
 * Find FINISHED matches that have no MATCH snapshot yet. Returned in kickoff
 * order so the caller can replay them sequentially.
 *
 * Powers two flows: the live sync's gap fill (newly-FINISHED matches in this
 * run + any gaps from prior outages) and the backfill script's initial pass.
 */
export async function findUnsnapshottedFinishedMatches(
    executor: Executor = db,
): Promise<Array<{ id: number; kickoff: Date }>> {
    return executor
        .select({ id: matchesTable.id, kickoff: matchesTable.kickoff })
        .from(matchesTable)
        .where(
            and(
                eq(matchesTable.status, "FINISHED"),
                sql`NOT EXISTS (
                    SELECT 1 FROM ${leaderboardSnapshots}
                    WHERE ${leaderboardSnapshots.causeKind} = 'MATCH'
                      AND ${leaderboardSnapshots.causeMatchId} = ${matchesTable.id}
                )`,
            ),
        )
        .orderBy(matchesTable.kickoff);
}

/**
 * Fetch the most recent snapshot's per-player state. Used as the `priorState`
 * for the next snapshot's delta computation.
 *
 * Returns null if no snapshot exists yet (very first run before backfill).
 */
export async function fetchMostRecentSnapshotState(
    executor: Executor = db,
): Promise<{
    snapshotId: number;
    state: SnapshotPlayerState[];
} | null> {
    const [latest] = await executor
        .select({ id: leaderboardSnapshots.id })
        .from(leaderboardSnapshots)
        .orderBy(sql`${leaderboardSnapshots.capturedAt} DESC, ${leaderboardSnapshots.id} DESC`)
        .limit(1);
    if (latest === undefined) {
        return null;
    }
    const rows = await executor
        .select({
            playerId: leaderboardSnapshotRows.playerId,
            rank: leaderboardSnapshotRows.rank,
            points: leaderboardSnapshotRows.points,
            bonusPoints: leaderboardSnapshotRows.bonusPoints,
        })
        .from(leaderboardSnapshotRows)
        .where(eq(leaderboardSnapshotRows.snapshotId, latest.id));
    return { snapshotId: latest.id, state: rows };
}

/**
 * Compare two snapshot states. Returns true when any player's points or rank
 * differ — used to detect score corrections (a previously-FINISHED match's
 * score changed between the last snapshot and now, so the standings have
 * shifted with no new match having finished).
 */
export function statesDiffer(
    a: SnapshotPlayerState[],
    b: SnapshotPlayerState[],
): boolean {
    if (a.length !== b.length) {
        return true;
    }
    const byPlayer = new Map(a.map((s) => [s.playerId, s] as const));
    for (const other of b) {
        const mine = byPlayer.get(other.playerId);
        if (mine === undefined) {
            return true;
        }
        if (mine.points !== other.points || mine.rank !== other.rank) {
            return true;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Runtime pipeline — wired into the sync cron and the bonus-resolution flow.
// ---------------------------------------------------------------------------

/**
 * Load every input buildLeaderboard needs to compute a snapshot. The shapes
 * intentionally mirror what page.tsx already passes to buildLeaderboard, so
 * that lib/scoring.ts stays the single source of truth for scoring logic.
 *
 * Pass an outer `executor` (a transaction handle) to read inside an existing
 * transaction — used by saveBonusResolutionAction so the resolution upsert
 * and the snapshot it triggers see a consistent view.
 */
export async function loadSnapshotInput(executor: Executor = db): Promise<SnapshotInput> {
    const [
        allPlayers,
        allMatches,
        allPredictions,
        allJokers,
        allBonusPicks,
        allResolutions,
    ] = await Promise.all([
        executor.select().from(playersTable),
        executor.select().from(matchesTable),
        executor.select().from(predictionsTable),
        executor.select().from(jokersTable),
        executor.select().from(bonusPicksTable),
        executor.select().from(bonusResolutionsTable),
    ]);

    return {
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
        bonusPicks: allBonusPicks.map((b) => ({
            playerId: b.playerId,
            kind: b.kind,
            groupLetter: b.groupLetter,
            teamId: b.teamId,
            playerName: b.playerName,
        })),
        bonusResolutions: allResolutions.map((r) => ({
            kind: r.kind,
            groupLetter: r.groupLetter,
            teamIds: r.teamIds,
            playerNames: r.playerNames,
        })),
    };
}

/**
 * Match-as-it-appears-in-the-table view paired with its kickoff so the gap
 * loop can pass each match's kickoff in to snapshotMatchesAsOf.
 */
type MatchInputWithKickoff = SnapshotInput["matches"][number] & { kickoff: Date };

async function loadSnapshotInputWithKickoffs(): Promise<{
    base: SnapshotInput;
    matchesWithKickoff: MatchInputWithKickoff[];
}> {
    const base = await loadSnapshotInput();
    const allMatches = await db
        .select({ id: matchesTable.id, kickoff: matchesTable.kickoff })
        .from(matchesTable);
    const kickoffById = new Map(allMatches.map((m) => [m.id, m.kickoff] as const));
    const matchesWithKickoff: MatchInputWithKickoff[] = base.matches.map((m) => ({
        ...m,
        kickoff: kickoffById.get(m.id) ?? new Date(0),
    }));
    return { base, matchesWithKickoff };
}

/**
 * Replay any FINISHED match that doesn't yet have a MATCH snapshot, then
 * detect score corrections. Both flows share a single read of the underlying
 * tables for efficiency.
 *
 * This is the function the sync cron and the backfill script both call. It
 * is idempotent: running it twice in a row is a no-op the second time
 * (because the gaps from the first run are now filled).
 *
 * Returns counts for audit-log purposes.
 */
export async function runSnapshotPipeline(): Promise<{
    matchSnapshotsWritten: number;
    correctionSnapshotsWritten: number;
    errors: string[];
}> {
    const errors: string[] = [];
    let matchSnapshotsWritten = 0;
    let correctionSnapshotsWritten = 0;

    const gaps = await findUnsnapshottedFinishedMatches();
    if (gaps.length > 0) {
        const { base, matchesWithKickoff } = await loadSnapshotInputWithKickoffs();

        // Walk gaps in chronological order. For each, compute state as-of
        // that match's kickoff and write one MATCH snapshot.
        for (const gap of gaps) {
            try {
                const cutoff = gap.kickoff;
                const filteredMatches = snapshotMatchesAsOf(matchesWithKickoff, cutoff);
                const state = computeSnapshotState({
                    ...base,
                    matches: filteredMatches.map((m) => ({
                        id: m.id,
                        round: m.round,
                        status: m.status,
                        homeScore: m.homeScore,
                        awayScore: m.awayScore,
                        homeTeamId: m.homeTeamId,
                        awayTeamId: m.awayTeamId,
                        winnerTeamId: m.winnerTeamId,
                    })),
                });
                const prior = await fetchMostRecentSnapshotState();
                await writeSnapshot({
                    capturedAt: new Date(cutoff.getTime() + SNAPSHOT_OFFSET_MS),
                    causeKind: "MATCH",
                    causeMatchId: gap.id,
                    causeBonusKind: null,
                    state,
                    priorState: prior?.state ?? null,
                });
                matchSnapshotsWritten++;
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                errors.push(`match ${gap.id}: ${message}`);
            }
        }
    }

    // Correction detection — compare the most recent snapshot against current
    // computed state. Any divergence after gap-fill means a score has been
    // edited on a previously-finished match.
    try {
        const prior = await fetchMostRecentSnapshotState();
        if (prior !== null) {
            const current = await loadSnapshotInput();
            const currentState = computeSnapshotState(current);
            if (statesDiffer(prior.state, currentState)) {
                await writeSnapshot({
                    capturedAt: new Date(),
                    causeKind: "CORRECTION",
                    causeMatchId: null,
                    causeBonusKind: null,
                    state: currentState,
                    priorState: prior.state,
                });
                correctionSnapshotsWritten++;
            }
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push(`correction-check: ${message}`);
    }

    return { matchSnapshotsWritten, correctionSnapshotsWritten, errors };
}

/**
 * Best-effort wrapper for the cron path: runs the pipeline, swallows any
 * top-level error into an `auditLog` row so a snapshot bug never blocks the
 * actual score sync from completing. Per the design: snapshot failure during
 * cron sync = log-and-self-heal, the next sync's gap detection retries.
 */
export async function runSnapshotPipelineQuietly(actor: string): Promise<void> {
    try {
        const result = await runSnapshotPipeline();
        if (result.errors.length > 0 || result.matchSnapshotsWritten > 0 || result.correctionSnapshotsWritten > 0) {
            await db.insert(auditLog).values({
                actor: `${actor}-snapshot`,
                action: result.errors.length > 0 ? "snapshot-error" : "snapshot-pipeline",
                detail: JSON.stringify(result),
            });
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        try {
            await db.insert(auditLog).values({
                actor: `${actor}-snapshot`,
                action: "snapshot-error",
                detail: message,
            });
        } catch {
            // If even the audit-log write fails there's nothing more we can do.
        }
    }
}
