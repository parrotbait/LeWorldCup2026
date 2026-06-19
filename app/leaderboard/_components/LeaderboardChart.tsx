import { and, asc, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
    leaderboardSnapshotRows,
    leaderboardSnapshots,
    matches,
    players,
    teams,
} from "@/db/schema";
import { LeaderboardChartClient, type RoundCutoffs } from "./LeaderboardChartClient";

/**
 * Server-side data loader for the position-over-time chart.
 *
 * Loads all snapshots + their player rows + a few helpers so the tooltip
 * can render "After ENG 2–1 USA" etc. without a per-tooltip round-trip.
 */
export async function LeaderboardChart({
    currentPlayerId,
    initialRange,
}: {
    currentPlayerId: number;
    initialRange: string | undefined;
}) {
    const [allSnapshots, allRows, allPlayers, allMatches, allTeams, koFirstKickoffs] =
        await Promise.all([
            db
                .select({
                    id: leaderboardSnapshots.id,
                    capturedAt: leaderboardSnapshots.capturedAt,
                    causeKind: leaderboardSnapshots.causeKind,
                    causeMatchId: leaderboardSnapshots.causeMatchId,
                    causeBonusKind: leaderboardSnapshots.causeBonusKind,
                })
                .from(leaderboardSnapshots)
                .orderBy(asc(leaderboardSnapshots.capturedAt), asc(leaderboardSnapshots.id)),
            db
                .select({
                    snapshotId: leaderboardSnapshotRows.snapshotId,
                    playerId: leaderboardSnapshotRows.playerId,
                    rank: leaderboardSnapshotRows.rank,
                    points: leaderboardSnapshotRows.points,
                    bonusPoints: leaderboardSnapshotRows.bonusPoints,
                    rankDelta: leaderboardSnapshotRows.rankDelta,
                    pointsDelta: leaderboardSnapshotRows.pointsDelta,
                })
                .from(leaderboardSnapshotRows),
            db.select({ id: players.id, displayName: players.displayName }).from(players),
            db
                .select({
                    id: matches.id,
                    homeTeamId: matches.homeTeamId,
                    awayTeamId: matches.awayTeamId,
                    homeScore: matches.homeScore,
                    awayScore: matches.awayScore,
                })
                .from(matches),
            db.select({ id: teams.id, code: teams.code }).from(teams),
            // First kickoff per KO round, but only counting matches where the
            // bracket has actually been drawn (both teams set). Null until
            // then — the client falls back to "all" for unavailable rounds.
            db
                .select({
                    round: matches.round,
                    firstKickoff: sql<Date>`MIN(${matches.kickoff})`.as("first_kickoff"),
                })
                .from(matches)
                .where(
                    and(
                        isNotNull(matches.homeTeamId),
                        isNotNull(matches.awayTeamId),
                        sql`${matches.round} != 'GROUP'`,
                    ),
                )
                .groupBy(matches.round),
        ]);

    const roundCutoffs: RoundCutoffs = {
        R32: null,
        R16: null,
        QF: null,
        SF: null,
        FINAL: null,
    };
    for (const row of koFirstKickoffs) {
        if (
            row.round === "R32" ||
            row.round === "R16" ||
            row.round === "QF" ||
            row.round === "SF" ||
            row.round === "FINAL"
        ) {
            // postgres-js returns timestamptz from raw SQL aggregates as a
            // string, not a Date — the sql<Date>` template type is a hint,
            // not a runtime cast. Coerce here.
            const raw = row.firstKickoff as unknown as Date | string;
            const ms = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
            if (Number.isFinite(ms)) {
                roundCutoffs[row.round] = ms;
            }
        }
    }

    if (allSnapshots.length === 0) {
        return (
            <div className="mt-6 rounded border border-ink/20 bg-ink/5 p-6 text-center text-sm opacity-70">
                No snapshots captured yet — run{" "}
                <code className="font-mono">pnpm backfill:snapshots</code> to populate
                history, or wait for the next cron sync to capture the first one.
            </div>
        );
    }

    // Pre-compute "ENG 2–1 USA" labels so the client tooltip stays cheap.
    const teamCodeById = new Map(allTeams.map((t) => [t.id, t.code] as const));
    const matchLabelById = new Map<number, string>();
    for (const m of allMatches) {
        const home = m.homeTeamId !== null ? teamCodeById.get(m.homeTeamId) ?? "?" : "?";
        const away = m.awayTeamId !== null ? teamCodeById.get(m.awayTeamId) ?? "?" : "?";
        const score =
            m.homeScore !== null && m.awayScore !== null
                ? `${m.homeScore}–${m.awayScore}`
                : "vs";
        matchLabelById.set(m.id, `${home} ${score} ${away}`);
    }

    // Index child rows by snapshot.
    const rowsBySnapshotId = new Map<
        number,
        Array<{
            playerId: number;
            rank: number;
            points: number;
            bonusPoints: number;
            rankDelta: number;
            pointsDelta: number;
        }>
    >();
    for (const r of allRows) {
        let bucket = rowsBySnapshotId.get(r.snapshotId);
        if (bucket === undefined) {
            bucket = [];
            rowsBySnapshotId.set(r.snapshotId, bucket);
        }
        bucket.push({
            playerId: r.playerId,
            rank: r.rank,
            points: r.points,
            bonusPoints: r.bonusPoints,
            rankDelta: r.rankDelta,
            pointsDelta: r.pointsDelta,
        });
    }

    const series = allSnapshots.map((s) => {
        const rows = rowsBySnapshotId.get(s.id) ?? [];
        let causeLabel: string;
        if (s.causeKind === "TOURNAMENT_START") {
            causeLabel = "Tournament kickoff";
        } else if (s.causeKind === "MATCH" && s.causeMatchId !== null) {
            causeLabel = matchLabelById.get(s.causeMatchId) ?? `Match ${s.causeMatchId}`;
        } else if (s.causeKind === "CORRECTION" && s.causeMatchId !== null) {
            causeLabel = `Correction · ${matchLabelById.get(s.causeMatchId) ?? `Match ${s.causeMatchId}`}`;
        } else if (s.causeKind === "BONUS") {
            causeLabel = `Bonus resolved · ${s.causeBonusKind ?? "?"}`;
        } else {
            causeLabel = s.causeKind;
        }
        return {
            snapshotId: s.id,
            capturedAt: s.capturedAt.getTime(),
            causeKind: s.causeKind,
            causeLabel,
            rowsByPlayerId: Object.fromEntries(rows.map((r) => [r.playerId, r])),
        };
    });

    const playerRoster = allPlayers.map((p) => ({ id: p.id, displayName: p.displayName }));

    return (
        <LeaderboardChartClient
            series={series}
            players={playerRoster}
            currentPlayerId={currentPlayerId}
            roundCutoffs={roundCutoffs}
            initialRange={initialRange}
        />
    );
}
