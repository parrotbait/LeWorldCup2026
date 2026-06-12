import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { db } from "@/db/client";
import { jokers, matches, players, predictions, teams } from "@/db/schema";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { flag, formatKickoff, pickLockTime } from "@/lib/utils";
import { isExact, predictionPoints } from "@/lib/scoring";

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
    isExact: boolean;
    correctResult: boolean;
    isJoker: boolean;
}

export default async function TodayPage() {
    await requireSession();

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
                        isExact: false,
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
                return {
                    playerId: player.id,
                    displayName: player.displayName,
                    homeScore: pred.homeScore,
                    awayScore: pred.awayScore,
                    hasPick: true,
                    points: base * (isJoker ? 2 : 1),
                    isExact: exact,
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

                {liveOrRecent.length === 0 ? (
                    <p className="mt-12 text-center text-sm opacity-60">
                        No matches in today&rsquo;s window.
                        {upcoming[0] !== undefined ? (
                            <>
                                {" "}Next kickoff: <strong>{formatKickoff(upcoming[0].kickoff)}</strong>.
                            </>
                        ) : null}
                    </p>
                ) : (
                    <div className="mt-8 space-y-8">
                        {liveOrRecent.map((m) => {
                            const rows = pickByMatch.get(m.id) ?? [];
                            const revealed =
                                pickLockTime(m.kickoff) <= Date.now() ||
                                m.status !== "SCHEDULED";
                            return (
                                <section key={m.id} className="rounded border border-ink/15">
                                    <header className="flex items-baseline justify-between border-b border-ink/15 px-4 py-3">
                                        <div>
                                            <p className="font-display text-[10px] uppercase tracking-[0.25em] text-tournament">
                                                {ROUND_LABEL[m.round]}
                                                {m.groupLetter !== null ? ` · Group ${m.groupLetter}` : ""}
                                            </p>
                                            <h2 className="mt-1 font-display text-xl tabular">
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
                                                const wentToET =
                                                    m.homeScoreFt !== null &&
                                                    m.awayScoreFt !== null &&
                                                    m.homeScore !== null &&
                                                    m.awayScore !== null &&
                                                    (m.homeScoreFt !== m.homeScore ||
                                                        m.awayScoreFt !== m.awayScore);
                                                const wentToPens =
                                                    m.homeScorePens !== null && m.awayScorePens !== null;
                                                if (!wentToET && !wentToPens) {
                                                    return null;
                                                }
                                                const parts: string[] = [];
                                                if (wentToET) {
                                                    parts.push(`${m.homeScoreFt}–${m.awayScoreFt} FT, AET`);
                                                }
                                                if (wentToPens) {
                                                    parts.push(`pens ${m.homeScorePens}–${m.awayScorePens}`);
                                                }
                                                return (
                                                    <p className="mt-1 font-display text-[10px] uppercase tracking-wider opacity-60">
                                                        {parts.join(" · ")}
                                                    </p>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex flex-col items-end gap-0.5 text-right">
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
                                    </header>

                                    {rows.length === 0 ? (
                                        <p className="px-4 py-6 text-center text-xs opacity-60">
                                            No players in the league yet.
                                        </p>
                                    ) : !revealed ? (
                                        <p className="px-4 py-6 text-center text-xs opacity-60">
                                            Picks reveal 15 min before kickoff.
                                        </p>
                                    ) : (
                                        <ul className="divide-y divide-ink/10 text-sm">
                                            {rows.map((r) => (
                                                <li
                                                    key={r.playerId}
                                                    className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2"
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
                                                                  : "opacity-30"
                                                        }`}
                                                    >
                                                        {r.hasPick && r.points > 0 ? `+${r.points}` : "—"}
                                                        {r.isExact ? (
                                                            <span className="ml-1 text-[10px] uppercase">
                                                                exact
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
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
