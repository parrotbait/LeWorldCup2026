import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
    auditLog,
    bonusPicks,
    bonusResolutions,
    leaderboardSnapshotRows,
    leaderboardSnapshots,
    matches,
    players,
    predictions,
    jokers,
    teams,
} from "@/db/schema";
import { requireSession } from "@/lib/auth";
import {
    buildLeaderboard,
    computeBonusBreakdownByPlayer,
    computeBonusPointsByPlayer,
    computePointsOnlyRank,
} from "@/lib/scoring";
import { computeStreaks, streakFlames } from "@/lib/streaks";
import { computePointsForMatches } from "@/lib/rivalry";
import { RivalryTicker } from "@/app/_components/rivalry-ticker";
import { NavBar } from "@/app/_components/navbar";
import { ViewToggle } from "./_components/ViewToggle";
import { LeaderboardChart } from "./_components/LeaderboardChart";
import { BonusTooltipRow, type BonusTooltipEntry } from "./_components/BonusTooltip";
import { RefreshDataButton } from "@/app/_components/refresh-data-button";
import { WrappedGate } from "./_components/WrappedGate";

export const revalidate = 30;

function relativeAgo(d: Date): string {
    const ms = Date.now() - d.getTime();
    if (ms < 60_000) {
        return "just now";
    }
    const mins = Math.floor(ms / 60_000);
    if (mins < 60) {
        return `${mins} min ago`;
    }
    const hours = Math.floor(mins / 60);
    if (hours < 48) {
        return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

interface PageProps {
    searchParams: Promise<{ view?: string; range?: string }>;
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
    const session = await requireSession();
    const params = await searchParams;
    const view: "table" | "chart" = params.view === "chart" ? "chart" : "table";

    const [
        allPlayers,
        allMatches,
        allPredictions,
        allJokers,
        allBonusPicks,
        allResolutions,
        allTeams,
        lastSync,
        latestSnapshot,
    ] = await Promise.all([
        db.select().from(players),
        db.select().from(matches),
        db.select().from(predictions),
        db.select().from(jokers),
        db.select().from(bonusPicks),
        db.select().from(bonusResolutions),
        db.select().from(teams),
        db
            .select({ at: auditLog.at })
            .from(auditLog)
            .where(eq(auditLog.action, "sync-results"))
            .orderBy(desc(auditLog.id))
            .limit(1),
        db
            .select({ id: leaderboardSnapshots.id })
            .from(leaderboardSnapshots)
            .orderBy(
                desc(leaderboardSnapshots.capturedAt),
                desc(leaderboardSnapshots.id),
            )
            .limit(1),
    ]);

    // Pull the most recent snapshot's per-player rankDelta for the ▲/▼
    // indicator next to each rank in the table.
    const latestSnapshotId = latestSnapshot[0]?.id;
    const latestSnapshotRows =
        latestSnapshotId !== undefined
            ? await db
                  .select({
                      playerId: leaderboardSnapshotRows.playerId,
                      rankDelta: leaderboardSnapshotRows.rankDelta,
                  })
                  .from(leaderboardSnapshotRows)
                  .where(eq(leaderboardSnapshotRows.snapshotId, latestSnapshotId))
            : [];
    const rankDeltaByPlayer = new Map(
        latestSnapshotRows.map((r) => [r.playerId, r.rankDelta] as const),
    );

    const bonusPointsByPlayer = computeBonusPointsByPlayer({
        picks: allBonusPicks.map((b) => ({
            playerId: b.playerId,
            kind: b.kind,
            groupLetter: b.groupLetter,
            teamId: b.teamId,
            playerName: b.playerName,
        })),
        resolutions: allResolutions.map((r) => ({
            kind: r.kind,
            groupLetter: r.groupLetter,
            teamIds: r.teamIds,
            playerNames: r.playerNames,
        })),
        matches: allMatches.map((m) => ({
            round: m.round,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
        })),
    });

    const teamLookup = new Map(allTeams.map((t) => [t.id, { name: t.name }]));
    const bonusBreakdownByPlayer = computeBonusBreakdownByPlayer({
        picks: allBonusPicks.map((b) => ({
            playerId: b.playerId,
            kind: b.kind,
            groupLetter: b.groupLetter,
            teamId: b.teamId,
            playerName: b.playerName,
        })),
        resolutions: allResolutions.map((r) => ({
            kind: r.kind,
            groupLetter: r.groupLetter,
            teamIds: r.teamIds,
            playerNames: r.playerNames,
        })),
        matches: allMatches.map((m) => ({
            round: m.round,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
        })),
        teamLookup,
    });

    const rows = buildLeaderboard({
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

    // Display rank: points-only 1224. Ties share a number; the next distinct
    // points value gets the slot it would have occupied. The row order of the
    // table itself still follows the full tie-break comparator, so a player
    // who's "ahead on tie-breaks" appears above a tied opponent.
    const pointsOnlyRank = computePointsOnlyRank(rows);

    const streaks = computeStreaks(
        allMatches.map((m) => ({
            id: m.id,
            kickoff: m.kickoff,
            round: m.round,
            status: m.status,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            winnerTeamId: m.winnerTeamId,
        })),
        allPredictions.map((p) => ({
            playerId: p.playerId,
            matchId: p.matchId,
            homeScore: p.homeScore,
            awayScore: p.awayScore,
        })),
        allPlayers.map((p) => p.id),
    );

    // Rivalry ticker: compute today's points from matches in the last 8h + next 24h window.
    const since = new Date(Date.now() - 8 * 60 * 60_000);
    const until = new Date(Date.now() + 24 * 60 * 60_000);
    const todayMatches = allMatches.filter(
        (m) => m.kickoff >= since && m.kickoff <= until,
    );
    const todayMatchIds = new Set(todayMatches.map((m) => m.id));
    const todayPreds = allPredictions.filter((p) => todayMatchIds.has(p.matchId));
    const todayJokersList = allJokers.filter((j) => todayMatchIds.has(j.matchId));
    const todayPoints = computePointsForMatches(
        todayMatches.map((m) => ({
            id: m.id,
            round: m.round,
            status: m.status,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            winnerTeamId: m.winnerTeamId,
        })),
        todayPreds.map((p) => ({
            playerId: p.playerId,
            matchId: p.matchId,
            homeScore: p.homeScore,
            awayScore: p.awayScore,
        })),
        todayJokersList.map((j) => ({
            playerId: j.playerId,
            matchId: j.matchId,
        })),
        allPlayers.map((p) => p.id),
    );

    const myIdx = rows.findIndex((r) => r.playerId === session.playerId);
    const rivalryYou = {
        displayName: session.displayName,
        pointsToday: todayPoints.get(session.playerId) ?? 0,
        totalPoints: myIdx !== -1 ? rows[myIdx]!.points : 0,
    };
    const rivalryAbove = myIdx > 0 ? {
        displayName: rows[myIdx - 1]!.displayName,
        pointsToday: todayPoints.get(rows[myIdx - 1]!.playerId) ?? 0,
        totalPoints: rows[myIdx - 1]!.points,
    } : null;
    const rivalryBelow = myIdx !== -1 && myIdx < rows.length - 1 ? {
        displayName: rows[myIdx + 1]!.displayName,
        pointsToday: todayPoints.get(rows[myIdx + 1]!.playerId) ?? 0,
        totalPoints: rows[myIdx + 1]!.points,
    } : null;

    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-3xl px-6 py-8">
                <h1 className="font-display text-2xl uppercase tracking-widest">Standings</h1>
                <ViewToggle active={view} />
                <p className="mt-2 text-xs opacity-60">
                    Tie-breakers: total → exact predictions → bonuses → KO results → signup
                </p>
                {(() => {
                    const lastAt = lastSync[0]?.at;
                    if (lastAt === undefined) {
                        return (
                            <p className="mt-1 text-[11px] uppercase tracking-wider opacity-50">
                                no sync yet
                            </p>
                        );
                    }
                    const ageMs = Date.now() - lastAt.getTime();
                    const stale = ageMs > 12 * 60 * 60_000;
                    const stamp = lastAt.toISOString().replace("T", " ").slice(0, 16) + "Z";
                    if (stale) {
                        return (
                            <p className="mt-1 inline-flex items-center gap-2 rounded border border-tournament/40 bg-tournament/10 px-2 py-1 font-display text-[11px] uppercase tracking-wider text-tournament">
                                ⚠ stale — last synced {relativeAgo(lastAt)} ({stamp})
                                <Link
                                    href="/admin/dashboard"
                                    className="underline underline-offset-2 hover:text-ink"
                                >
                                    sync now
                                </Link>
                            </p>
                        );
                    }
                    return (
                        <p className="mt-1 text-[11px] uppercase tracking-wider opacity-50">
                            last synced {relativeAgo(lastAt)} · {stamp}
                        </p>
                    );
                })()}
                <RefreshDataButton />
                <WrappedGate playerId={session.playerId} />

                {view === "chart" ? (
                    <LeaderboardChart
                        currentPlayerId={session.playerId}
                        initialRange={params.range}
                    />
                ) : (
                    <table className="mt-6 w-full text-sm tabular">
                        <thead className="border-b border-ink/30 text-left font-display text-xs uppercase tracking-wider">
                            <tr>
                                <th className="py-2 pr-2">#</th>
                                <th className="py-2 pr-2">Player</th>
                                <th className="py-2 pr-2 text-right">Pred</th>
                                <th className="py-2 pr-2 text-right">Bonus</th>
                                <th className="py-2 pr-2 text-right">Exact</th>
                                <th className="py-2 pr-2 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center opacity-60">
                                        No players yet. Share the invite code.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((r) => {
                                    const me = r.playerId === session.playerId;
                                    const predPoints = r.points - r.bonusPoints;
                                    const rank = pointsOnlyRank.get(r.playerId) ?? 0;
                                    const delta = rankDeltaByPlayer.get(r.playerId) ?? 0;
                                    const breakdown = bonusBreakdownByPlayer.get(r.playerId) ?? [];
                                    const streak = streaks.get(r.playerId) ?? 0;
                                    const flames = streakFlames(streak);
                                    const tooltipEntries: BonusTooltipEntry[] = breakdown.map((e) => ({
                                        label: e.label,
                                        pick: e.pick,
                                        points: e.points,
                                    }));
                                    return (
                                        <BonusTooltipRow
                                            key={r.playerId}
                                            entries={tooltipEntries}
                                            className={`border-b border-ink/10 ${me ? "bg-mustard/15" : ""}`}
                                        >
                                            <td className="py-2 pr-2">{rank}</td>
                                            <td className="py-2 pr-2">
                                                <Link
                                                    href={`/players/${r.playerId}` as never}
                                                    className="hover:text-tournament hover:underline"
                                                >
                                                    {rank === 1 ? "👑 " : ""}
                                                    {r.displayName}
                                                    {me ? (
                                                        <span className="ml-2 text-xs opacity-50">
                                                            (you)
                                                        </span>
                                                    ) : null}
                                                </Link>
                                                {flames !== "" && (
                                                    <span className="ml-1 cursor-default" title={`${streak} correct in a row`}>
                                                        {flames}
                                                    </span>
                                                )}
                                                <RankDelta delta={delta} />
                                            </td>
                                            <td className="py-2 pr-2 text-right opacity-70">
                                                {predPoints}
                                            </td>
                                            <td className="py-2 pr-2 text-right opacity-70">
                                                {r.bonusPoints}
                                            </td>
                                            <td className="py-2 pr-2 text-right opacity-70">
                                                {r.exactCount}
                                            </td>
                                            <td className="py-2 pr-2 text-right font-display text-base font-bold">
                                                {r.points}
                                            </td>
                                        </BonusTooltipRow>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                )}

                {view === "table" && rows.some((r) => r.bonusPoints > 0) ? (
                    <section className="mt-10">
                        <h2 className="font-display text-sm uppercase tracking-wider">
                            Bonus points allocated
                        </h2>
                        <p className="mt-1 text-xs opacity-60">
                            Points awarded from resolved bonus picks across all players.
                        </p>
                        <table className="mt-4 w-full text-sm tabular">
                            <thead className="border-b border-ink/30 text-left font-display text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="py-2 pr-2">Player</th>
                                    <th className="py-2 pr-2">Bonus</th>
                                    <th className="py-2 pr-2">Pick</th>
                                    <th className="py-2 pl-2 text-right">Pts</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows
                                    .flatMap((r) => {
                                        const breakdown = bonusBreakdownByPlayer.get(r.playerId) ?? [];
                                        return breakdown
                                            .filter((e) => e.points > 0)
                                            .map((e) => ({
                                                playerId: r.playerId,
                                                displayName: r.displayName,
                                                ...e,
                                            }));
                                    })
                                    .sort((a, b) => b.points - a.points || a.label.localeCompare(b.label))
                                    .map((entry) => (
                                        <tr
                                            key={`${entry.playerId}-${entry.kind}-${entry.groupLetter ?? ""}`}
                                            className="border-b border-ink/10"
                                        >
                                            <td className="py-2 pr-2">
                                                <Link
                                                    href={`/players/${entry.playerId}` as never}
                                                    className="hover:text-tournament hover:underline"
                                                >
                                                    {entry.displayName}
                                                </Link>
                                            </td>
                                            <td className="py-2 pr-2 text-xs opacity-70">
                                                {entry.label}
                                            </td>
                                            <td className="py-2 pr-2">{entry.pick}</td>
                                            <td className="py-2 pl-2 text-right font-display text-emerald-700">
                                                {entry.points}
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </section>
                ) : null}
            </main>
        </>
    );
}

/**
 * ▲/▼ indicator next to the rank. Renders nothing when |delta| < 1 (no
 * movement since the last snapshot, or no prior snapshot exists yet).
 *
 * Positive delta = moved up the table (lower rank number) → green ▲.
 * Negative delta = moved down → red ▼.
 */
function RankDelta({ delta }: { delta: number }) {
    if (delta === 0) {
        return null;
    }
    const isUp = delta > 0;
    const colorClass = isUp ? "text-emerald-700" : "text-tournament";
    const symbol = isUp ? "▲" : "▼";
    return (
        <span className={`ml-2 align-middle font-display text-[10px] ${colorClass}`}>
            <span className="inline-block translate-y-[0.5px]">{symbol}</span>
            <span className="ml-0.5">{Math.abs(delta)}</span>
        </span>
    );
}
