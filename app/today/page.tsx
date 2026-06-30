import { and, asc, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { db } from "@/db/client";
import { auditLog, jokers, leaderboardSnapshotRows, leaderboardSnapshots, matches, players, predictions, teams } from "@/db/schema";
import { Confetti } from "./_components/confetti";
import { CountdownHero } from "./_components/countdown-hero";
import { ProvisionalBadge } from "./_components/provisional-badge";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { flag, formatKickoff, pickLockTime } from "@/lib/utils";
import { isExact, predictionPoints, buildLeaderboard, computeBonusPointsByPlayer } from "@/lib/scoring";
import { computePointsForMatches } from "@/lib/rivalry";
import { RivalryTicker } from "@/app/_components/rivalry-ticker";
import { RefreshDataButton } from "@/app/_components/refresh-data-button";

// Always fresh — picks reveal at kickoff and the daily sync may run between
// renders.
export const revalidate = 0;

const ROUND_LABEL: Record<string, string> = {
    GROUP: "Group",
    R32: "Round of 32",
    R16: "Round of 16",
    QF: "Quarter-finals",
    SF: "Semi-finals",
    THIRD: "Third place",
    FINAL: "Final",
};

interface PlayerPickRow {
    playerId: number;
    displayName: string;
    homeScore: number | null;
    awayScore: number | null;
    hasPick: boolean;
    points: number;
    provisionalPoints: number;
    isExact: boolean;
    isProvisionalExact: boolean;
    correctResult: boolean;
    isJoker: boolean;
}

export default async function TodayPage() {
    const session = await requireSession();

    // Show fixtures from the past 8h plus anything kicking off in the next
    // 24h. Past window is short on purpose — yesterday's slate doesn't
    // belong on "today"; users can hop to /matches for the full archive.
    const since = new Date(Date.now() - 8 * 60 * 60_000);
    const until = new Date(Date.now() + 24 * 60 * 60_000);

    const home = alias(teams, "home");
    const away = alias(teams, "away");

    const liveOrRecent = await db
        .select({
            id: matches.id,
            kickoff: matches.kickoff,
            round: matches.round,
            groupLetter: matches.groupLetter,
            status: matches.status,
            homeScore: matches.homeScore,
            awayScore: matches.awayScore,
            homeScoreFt: matches.homeScoreFt,
            awayScoreFt: matches.awayScoreFt,
            homeScorePens: matches.homeScorePens,
            awayScorePens: matches.awayScorePens,
            homeTeamId: matches.homeTeamId,
            awayTeamId: matches.awayTeamId,
            winnerTeamId: matches.winnerTeamId,
            homeCode: home.code,
            homeName: home.name,
            awayCode: away.code,
            awayName: away.name,
        })
        .from(matches)
        .leftJoin(home, eq(matches.homeTeamId, home.id))
        .leftJoin(away, eq(matches.awayTeamId, away.id))
        .where(
            or(
                eq(matches.status, "LIVE"),
                and(gte(matches.kickoff, since), lte(matches.kickoff, until)),
            ),
        );

    // Display order: live first (it's literally "now"), then everything else
    // sorted by absolute time-distance from now — so the very next kickoff
    // and the just-finished match jostle for #1 based on which is closer in
    // time, rather than always showing future-first or past-first.
    const nowMs = Date.now();
    liveOrRecent.sort((a, b) => {
        const aLive = a.status === "LIVE";
        const bLive = b.status === "LIVE";
        if (aLive !== bLive) {
            return aLive ? -1 : 1;
        }
        return (
            Math.abs(a.kickoff.getTime() - nowMs) -
            Math.abs(b.kickoff.getTime() - nowMs)
        );
    });

    // Find next-kickoff time for the empty-state hint.
    const upcoming = await db
        .select({ kickoff: matches.kickoff })
        .from(matches)
        .where(eq(matches.status, "SCHEDULED"))
        .orderBy(asc(matches.kickoff))
        .limit(1);

    // Last sync timestamp for the "data as of" staleness indicator on LIVE matches.
    const hasLiveMatch = liveOrRecent.some((m) => m.status === "LIVE");
    let lastSyncAt: Date | null = null;
    if (hasLiveMatch) {
        const [syncEntry] = await db
            .select({ at: auditLog.at })
            .from(auditLog)
            .where(eq(auditLog.action, "sync-results"))
            .orderBy(desc(auditLog.id))
            .limit(1);
        lastSyncAt = syncEntry?.at ?? null;
    }

    let pickByMatch = new Map<number, PlayerPickRow[]>();
    if (liveOrRecent.length > 0) {
        const matchIds = liveOrRecent.map((m) => m.id);
        const [allPlayers, allPreds, allJokers] = await Promise.all([
            db.select().from(players),
            db.select().from(predictions).where(inArray(predictions.matchId, matchIds)),
            db.select().from(jokers).where(inArray(jokers.matchId, matchIds)),
        ]);
        const jokerByPlayerMatch = new Map(
            allJokers.map((j) => [`${j.playerId}:${j.matchId}`, true]),
        );

        for (const m of liveOrRecent) {
            const matchPredsByPlayer = new Map(
                allPreds.filter((p) => p.matchId === m.id).map((p) => [p.playerId, p]),
            );
            const rows: PlayerPickRow[] = allPlayers.map((player) => {
                const pred = matchPredsByPlayer.get(player.id);
                const isJoker = jokerByPlayerMatch.has(`${player.id}:${m.id}`);
                if (pred === undefined) {
                    return {
                        playerId: player.id,
                        displayName: player.displayName,
                        homeScore: null,
                        awayScore: null,
                        hasPick: false,
                        points: 0,
                        provisionalPoints: 0,
                        isExact: false,
                        isProvisionalExact: false,
                        correctResult: false,
                        isJoker,
                    };
                }
                const base = predictionPoints(m, {
                    homeScore: pred.homeScore,
                    awayScore: pred.awayScore,
                });
                const exact = isExact(m, {
                    homeScore: pred.homeScore,
                    awayScore: pred.awayScore,
                });
                const result = base > 0;

                const provisionalBase = m.status === "LIVE"
                    ? predictionPoints(
                          { ...m, status: "FINISHED" },
                          { homeScore: pred.homeScore, awayScore: pred.awayScore },
                      )
                    : 0;
                const provisionalExact = m.status === "LIVE"
                    ? isExact(
                          { ...m, status: "FINISHED" },
                          { homeScore: pred.homeScore, awayScore: pred.awayScore },
                      )
                    : false;

                return {
                    playerId: player.id,
                    displayName: player.displayName,
                    homeScore: pred.homeScore,
                    awayScore: pred.awayScore,
                    hasPick: true,
                    points: base * (isJoker ? 2 : 1),
                    provisionalPoints: provisionalBase * (isJoker ? 2 : 1),
                    isExact: exact,
                    isProvisionalExact: provisionalExact,
                    correctResult: result && !exact,
                    isJoker,
                };
            });
            rows.sort((a, b) => {
                if (a.points !== b.points) return b.points - a.points;
                if (a.hasPick !== b.hasPick) return a.hasPick ? -1 : 1;
                return a.displayName.localeCompare(b.displayName);
            });
            pickByMatch.set(m.id, rows);
        }
    }

    // Rivalry ticker: find neighbours in the standings and compare today's points.
    let rivalryAbove: { displayName: string; pointsToday: number; totalPoints: number } | null = null;
    let rivalryBelow: { displayName: string; pointsToday: number; totalPoints: number } | null = null;
    let rivalryYou: { displayName: string; pointsToday: number; totalPoints: number } = {
        displayName: session.displayName,
        pointsToday: 0,
        totalPoints: 0,
    };

    if (liveOrRecent.length > 0) {
        const latestSnap = await db
            .select({ id: leaderboardSnapshots.id })
            .from(leaderboardSnapshots)
            .orderBy(desc(leaderboardSnapshots.capturedAt), desc(leaderboardSnapshots.id))
            .limit(1);

        if (latestSnap[0] !== undefined) {
            const snapRows = await db
                .select({
                    playerId: leaderboardSnapshotRows.playerId,
                    rank: leaderboardSnapshotRows.rank,
                    points: leaderboardSnapshotRows.points,
                })
                .from(leaderboardSnapshotRows)
                .where(eq(leaderboardSnapshotRows.snapshotId, latestSnap[0].id));

            const sorted = snapRows.sort((a, b) => a.rank - b.rank);
            const playerNames = new Map<number, string>();
            const allP = await db.select({ id: players.id, displayName: players.displayName }).from(players);
            for (const p of allP) {
                playerNames.set(p.id, p.displayName);
            }

            const myIdx = sorted.findIndex((r) => r.playerId === session.playerId);
            if (myIdx !== -1) {
                rivalryYou.totalPoints = sorted[myIdx]!.points;

                // Compute today's points per player from today's matches
                const matchIds = liveOrRecent.map((m) => m.id);
                const todayPreds = await db.select().from(predictions).where(inArray(predictions.matchId, matchIds));
                const todayJokers = await db.select().from(jokers).where(inArray(jokers.matchId, matchIds));
                const todayPoints = computePointsForMatches(
                    liveOrRecent.map((m) => ({
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
                    todayJokers.map((j) => ({
                        playerId: j.playerId,
                        matchId: j.matchId,
                    })),
                    sorted.map((r) => r.playerId),
                );

                rivalryYou.pointsToday = todayPoints.get(session.playerId) ?? 0;

                if (myIdx > 0) {
                    const above = sorted[myIdx - 1]!;
                    rivalryAbove = {
                        displayName: playerNames.get(above.playerId) ?? "?",
                        pointsToday: todayPoints.get(above.playerId) ?? 0,
                        totalPoints: above.points,
                    };
                }
                if (myIdx < sorted.length - 1) {
                    const below = sorted[myIdx + 1]!;
                    rivalryBelow = {
                        displayName: playerNames.get(below.playerId) ?? "?",
                        pointsToday: todayPoints.get(below.playerId) ?? 0,
                        totalPoints: below.points,
                    };
                }
            }
        }
    }

    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-3xl px-6 py-8">
                <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <h1 className="font-display text-2xl uppercase tracking-widest">Today</h1>
                    <Link
                        href={"/matches" as never}
                        className="text-xs underline opacity-60 hover:text-tournament"
                    >
                        all matches →
                    </Link>
                </header>
                <p className="mt-1 text-xs opacity-60">
                    Last 8 hours and the next 24 hours of fixtures, with everyone&rsquo;s picks
                    (revealed at kickoff). Scores sync twice a day. Want previous matches?{" "}
                    <Link href={"/matches" as never} className="underline hover:text-tournament">
                        See all matches →
                    </Link>
                </p>
                <RefreshDataButton />

                {liveOrRecent.length === 0 ? (
                    upcoming[0] !== undefined ? (
                        <CountdownHero nextKickoff={upcoming[0].kickoff.toISOString()} />
                    ) : (
                        <p className="mt-12 text-center text-sm opacity-60">
                            No matches scheduled yet.
                        </p>
                    )
                ) : (
                    <div className="mt-8 space-y-8">
                        {liveOrRecent.map((m) => {
                            const rows = pickByMatch.get(m.id) ?? [];
                            const revealed =
                                pickLockTime(m.kickoff) <= Date.now() ||
                                m.status !== "SCHEDULED";
                            return (
                                <section key={m.id} className="overflow-visible rounded border border-ink/15">
                                    <header className="relative border-b border-ink/15 px-4 py-3">
                                        <div className="absolute right-4 top-3 flex flex-col items-end gap-0.5 text-right">
                                            <span className="font-display text-[10px] uppercase tracking-wider opacity-70">
                                                {formatKickoff(m.kickoff)}
                                            </span>
                                            <span
                                                className={`font-display text-[10px] uppercase tracking-widest ${
                                                    m.status === "LIVE"
                                                        ? "text-tournament"
                                                        : "opacity-60"
                                                }`}
                                            >
                                                {m.status === "LIVE"
                                                    ? "● live"
                                                    : m.status === "FINISHED"
                                                      ? "full time"
                                                      : "scheduled"}
                                            </span>
                                        </div>
                                        <p className="font-display text-[10px] uppercase tracking-[0.25em] text-tournament">
                                            {ROUND_LABEL[m.round]}
                                            {m.groupLetter !== null ? ` · Group ${m.groupLetter}` : ""}
                                        </p>
                                        <h2 className="mt-1 font-display text-xl tabular whitespace-nowrap">
                                            <span className="mr-2">{flag(m.homeCode ?? "")}</span>
                                            {m.homeName ?? "TBD"}
                                            <span className="mx-3 opacity-50">
                                                {m.status === "SCHEDULED"
                                                    ? "vs"
                                                    : `${m.homeScore ?? 0} – ${m.awayScore ?? 0}`}
                                            </span>
                                            {m.awayName ?? "TBD"}
                                            <span className="ml-2">{flag(m.awayCode ?? "")}</span>
                                        </h2>
                                        {(() => {
                                            const wentToPens =
                                                m.homeScorePens !== null && m.awayScorePens !== null;
                                            const wentToET =
                                                m.homeScoreFt !== null &&
                                                m.awayScoreFt !== null &&
                                                m.homeScore !== null &&
                                                m.awayScore !== null &&
                                                (m.homeScoreFt !== m.homeScore ||
                                                    m.awayScoreFt !== m.awayScore ||
                                                    wentToPens);
                                            if (!wentToET && !wentToPens) {
                                                return null;
                                            }
                                            const parts: string[] = [];
                                            if (wentToET) {
                                                parts.push(`${m.homeScoreFt}–${m.awayScoreFt} FT`);
                                                parts.push(`${m.homeScore}–${m.awayScore} AET`);
                                            }
                                            if (wentToPens) {
                                                parts.push(`PENS ${m.homeScorePens}–${m.awayScorePens}`);
                                            }
                                            return (
                                                <p className="mt-1 font-display text-[10px] uppercase tracking-wider opacity-60">
                                                    {parts.join(", ")}
                                                </p>
                                            );
                                        })()}
                                    </header>

                                    {rows.length === 0 ? (
                                        <p className="px-4 py-6 text-center text-xs opacity-60">
                                            No players in the league yet.
                                        </p>
                                    ) : (
                                        <>
                                            {(() => {
                                                const myRow = rows.find((r) => r.playerId === session.playerId);
                                                if (myRow === undefined) {
                                                    return null;
                                                }
                                                if (!myRow.hasPick) {
                                                    if (m.status !== "FINISHED") {
                                                        return null;
                                                    }
                                                    return (
                                                        <div className="relative mx-4 mt-3 mb-2 rounded-lg border border-ink/20 bg-ink/5 px-4 py-3">
                                                            <p className="font-display text-[10px] uppercase tracking-widest opacity-60">
                                                                Your prediction
                                                            </p>
                                                            <p className="mt-1 font-display text-sm opacity-50">
                                                                No pick submitted
                                                            </p>
                                                        </div>
                                                    );
                                                }
                                                if (m.status === "FINISHED") {
                                                    return (
                                                        <div className={`relative mx-4 mt-3 mb-2 rounded-lg border px-4 py-3 ${myRow.isExact ? "border-pitch/40 bg-pitch/10" : myRow.correctResult ? "border-ink/20 bg-ink/5" : "border-tournament/30 bg-tournament/5"}`}>
                                                            {myRow.isExact && <Confetti matchId={m.id} />}
                                                            <p className="font-display text-[10px] uppercase tracking-widest opacity-60">
                                                                Your prediction
                                                            </p>
                                                            <div className="mt-1 flex items-center justify-between">
                                                                <span className="font-display tabular text-lg">
                                                                    {myRow.homeScore} – {myRow.awayScore}
                                                                </span>
                                                                <span className={`font-display tabular text-lg ${myRow.isExact ? "text-pitch" : myRow.correctResult ? "" : "text-tournament"}`}>
                                                                    {myRow.points > 0 ? `+${myRow.points}` : "0"}
                                                                    {myRow.isExact && (
                                                                        <span className="ml-1 text-[10px] uppercase">
                                                                            exact
                                                                        </span>
                                                                    )}
                                                                    {myRow.isJoker && (
                                                                        <span className="ml-1 text-[10px] text-mustard uppercase">
                                                                            ×2
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </div>
                                                            {(() => {
                                                                const wentToPens =
                                                                    m.homeScorePens !== null && m.awayScorePens !== null;
                                                                const wentToET =
                                                                    m.homeScoreFt !== null &&
                                                                    m.awayScoreFt !== null &&
                                                                    m.homeScore !== null &&
                                                                    m.awayScore !== null &&
                                                                    (m.homeScoreFt !== m.homeScore ||
                                                                        m.awayScoreFt !== m.awayScore ||
                                                                        wentToPens);
                                                                if (!wentToET && !wentToPens) {
                                                                    return null;
                                                                }
                                                                const parts: string[] = [];
                                                                if (wentToET) {
                                                                    parts.push(`${m.homeScoreFt}–${m.awayScoreFt} FT`);
                                                                    parts.push(`${m.homeScore}–${m.awayScore} AET`);
                                                                }
                                                                if (wentToPens) {
                                                                    parts.push(`PENS ${m.homeScorePens}–${m.awayScorePens}`);
                                                                }
                                                                return (
                                                                    <p className="mt-1 font-display text-[10px] uppercase tracking-wider opacity-60">
                                                                        {parts.join(", ")}
                                                                    </p>
                                                                );
                                                            })()}
                                                        </div>
                                                    );
                                                }
                                                if (m.status === "LIVE") {
                                                    const liveCardStyle = myRow.isProvisionalExact
                                                        ? "border-pitch/40 bg-pitch/5"
                                                        : myRow.provisionalPoints > 0
                                                          ? "border-ink/30 bg-ink/5"
                                                          : "border-tournament/30 bg-tournament/5";
                                                    return (
                                                        <div className={`relative mx-4 mt-3 mb-2 rounded-lg border border-dashed ${liveCardStyle} px-4 py-3`}>
                                                            <p className="font-display text-[10px] uppercase tracking-widest opacity-60">
                                                                Your prediction
                                                            </p>
                                                            <div className="mt-1 flex items-center justify-between">
                                                                <span className="font-display tabular text-lg">
                                                                    {myRow.homeScore} – {myRow.awayScore}
                                                                </span>
                                                                {myRow.provisionalPoints > 0 ? (
                                                                    <ProvisionalBadge
                                                                        points={myRow.provisionalPoints}
                                                                        isExact={myRow.isProvisionalExact}
                                                                        isJoker={myRow.isJoker}
                                                                    />
                                                                ) : (
                                                                    <span className="font-display tabular text-lg opacity-40">
                                                                        0
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="mt-2 text-[10px] opacity-40">
                                                                {myRow.provisionalPoints > 0
                                                                    ? "Would earn if score holds — not final until full time"
                                                                    : "Points only awarded at full time"}
                                                                {lastSyncAt !== null && (
                                                                    <span className="ml-1">
                                                                        · score as of {lastSyncAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}
                                                                    </span>
                                                                )}
                                                            </p>
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <div className="relative mx-4 mt-3 mb-2 rounded-lg border border-ink/20 bg-ink/5 px-4 py-3">
                                                        <p className="font-display text-[10px] uppercase tracking-widest opacity-60">
                                                            Your prediction
                                                        </p>
                                                        <div className="mt-1 flex items-center justify-between">
                                                            <span className="font-display tabular text-lg">
                                                                {myRow.homeScore} – {myRow.awayScore}
                                                            </span>
                                                            <span className="flex items-center gap-2">
                                                                {myRow.isJoker && (
                                                                    <span className="font-display text-[10px] text-mustard uppercase">
                                                                        joker ×2
                                                                    </span>
                                                                )}
                                                                {m.status === "SCHEDULED" && pickLockTime(m.kickoff) > Date.now() && (
                                                                    <Link
                                                                        href={`/predictions#match-${m.id}` as never}
                                                                        className="font-display text-[10px] uppercase tracking-wider text-tournament hover:underline"
                                                                    >
                                                                        change →
                                                                    </Link>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                            {!revealed ? (
                                                <p className="px-4 py-6 text-center text-xs opacity-60">
                                                    Picks reveal 15 min before kickoff.
                                                </p>
                                            ) : (
                                            <>
                                            {(() => {
                                                if (m.status !== "FINISHED" && m.status !== "LIVE") {
                                                    return null;
                                                }
                                                const withPick = rows.filter((r) => r.hasPick);
                                                if (withPick.length === 0) {
                                                    return null;
                                                }
                                                const homeWin = withPick.filter((r) => r.homeScore! > r.awayScore!).length;
                                                const draw = withPick.filter((r) => r.homeScore! === r.awayScore!).length;
                                                const awayWin = withPick.length - homeWin - draw;
                                                const total = withPick.length;
                                                return (
                                                    <div className="mx-4 mb-1 mt-2 flex items-center gap-3 text-[10px] uppercase tracking-wider opacity-50">
                                                        <span>{homeWin}/{total} home</span>
                                                        <span>{draw}/{total} draw</span>
                                                        <span>{awayWin}/{total} away</span>
                                                    </div>
                                                );
                                            })()}
                                            <ul className="divide-y divide-ink/10 text-sm">
                                                {(() => {
                                                    const withPick = rows.filter((r) => r.hasPick);
                                                    const total = withPick.length;
                                                    let crowdThreshold = 0;
                                                    let actualOutcome: "H" | "D" | "A" | null = null;
                                                    if (m.status === "FINISHED" && m.homeScore !== null && m.awayScore !== null && total > 0) {
                                                        actualOutcome = m.homeScore > m.awayScore ? "H" : m.homeScore < m.awayScore ? "A" : "D";
                                                        const matchingCount = withPick.filter((r) => {
                                                            const o = r.homeScore! > r.awayScore! ? "H" : r.homeScore! < r.awayScore! ? "A" : "D";
                                                            return o === actualOutcome;
                                                        }).length;
                                                        crowdThreshold = matchingCount / total;
                                                    }
                                                    return rows.filter((r) => r.playerId !== session.playerId).map((r) => {
                                                        const isContrarian = actualOutcome !== null && r.hasPick && (r.correctResult || r.isExact) && crowdThreshold <= 0.2;
                                                        return (
                                                    <li
                                                        key={r.playerId}
                                                        className={`grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2 ${r.isExact ? "bg-pitch/5 ring-1 ring-inset ring-pitch/20" : ""}`}
                                                    >
                                                    <span>
                                                        <Link
                                                            href={`/players/${r.playerId}` as never}
                                                            className="hover:text-tournament hover:underline"
                                                        >
                                                            {r.displayName}
                                                        </Link>
                                                        {r.isJoker ? (
                                                            <span className="ml-2 font-display text-[10px] text-mustard">
                                                                joker ×2
                                                            </span>
                                                        ) : null}
                                                        {isContrarian ? (
                                                            <span className="ml-2 font-display text-[10px] text-mustard" title="Predicted against the crowd and got it right">
                                                                against the crowd
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                    <span className="font-display tabular text-base">
                                                        {r.hasPick ? (
                                                            <>
                                                                {r.homeScore} – {r.awayScore}
                                                            </>
                                                        ) : (
                                                            <span className="text-[10px] uppercase opacity-50">
                                                                no pick
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span
                                                        className={`w-20 text-right font-display tabular ${
                                                            r.isExact
                                                                ? "text-pitch"
                                                                : r.correctResult
                                                                  ? "opacity-80"
                                                                  : m.status === "LIVE" && r.provisionalPoints > 0
                                                                    ? "animate-pulse opacity-40"
                                                                    : "opacity-30"
                                                        }`}
                                                    >
                                                        {m.status === "LIVE" && r.hasPick && r.provisionalPoints > 0 ? (
                                                            <span className="inline-flex items-center justify-end gap-1" title="Provisional — not final until full time">
                                                                +{r.provisionalPoints}
                                                                <span className="relative flex h-1.5 w-1.5">
                                                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tournament opacity-75" />
                                                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-tournament" />
                                                                </span>
                                                            </span>
                                                        ) : r.hasPick && r.points > 0 ? (
                                                            <>
                                                                +{r.points}
                                                                {r.isExact ? (
                                                                    <span className="ml-1 text-[10px] uppercase">
                                                                        exact
                                                                    </span>
                                                                ) : null}
                                                            </>
                                                        ) : "—"}
                                                    </span>
                                                </li>
                                                        );
                                                    });
                                                })()}
                                        </ul>
                                        {m.status === "LIVE" && (
                                            <p className="flex items-center justify-center gap-1.5 px-4 py-2 text-[10px] uppercase tracking-wider opacity-50">
                                                <span className="relative flex h-2 w-2">
                                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tournament opacity-75" />
                                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-tournament" />
                                                </span>
                                                points are provisional until full time
                                                {lastSyncAt !== null && (
                                                    <span>
                                                        · data as of {lastSyncAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}
                                                    </span>
                                                )}
                                            </p>
                                        )}
                                        </>
                                    )}
                                        </>
                                    )}
                                </section>
                            );
                        })}
                    </div>
                )}
            </main>
        </>
    );
}
