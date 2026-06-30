import { db } from "@/db/client";
import { jokers, matches, players, predictions, teams } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { flag, formatKickoff, pickLockTime, scoreSubtitle } from "@/lib/utils";
import { predictionPoints } from "@/lib/scoring";

export const revalidate = 30;

interface PredRow {
    playerId: number;
    displayName: string;
    homeScore: number | null;
    awayScore: number | null;
    isJoker: boolean;
}

export default async function MatchesPage() {
    const session = await requireSession();

    const home = alias(teams, "home");
    const away = alias(teams, "away");

    const [rows, allPlayers, allPredictions, allJokers] = await Promise.all([
        db
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
            .orderBy(asc(matches.kickoff)),
        db.select().from(players),
        db.select().from(predictions),
        db.select().from(jokers),
    ]);

    // Build per-match prediction lookup. Pre-kickoff matches show only the
    // viewer's own pick (mirrors the per-match detail page rule); post-kickoff
    // they list every player so absent picks are visible.
    const now = Date.now();
    const predsByMatch = new Map<number, typeof allPredictions>();
    for (const p of allPredictions) {
        const list = predsByMatch.get(p.matchId) ?? [];
        list.push(p);
        predsByMatch.set(p.matchId, list);
    }
    const jokerByPlayerRound = new Map<string, number>();
    for (const j of allJokers) {
        jokerByPlayerRound.set(`${j.playerId}:${j.round}`, j.matchId);
    }

    const buildPredRows = (m: (typeof rows)[number]): { kickedOff: boolean; rows: PredRow[] } => {
        const kickedOff =
            pickLockTime(m.kickoff) <= now || m.status !== "SCHEDULED";
        const matchPreds = predsByMatch.get(m.id) ?? [];
        const predByPlayer = new Map(matchPreds.map((p) => [p.playerId, p]));
        if (kickedOff) {
            return {
                kickedOff,
                rows: allPlayers.map((p) => {
                    const pred = predByPlayer.get(p.id);
                    return {
                        playerId: p.id,
                        displayName: p.displayName,
                        homeScore: pred?.homeScore ?? null,
                        awayScore: pred?.awayScore ?? null,
                        isJoker: jokerByPlayerRound.get(`${p.id}:${m.round}`) === m.id,
                    };
                }),
            };
        }
        const mine = predByPlayer.get(session.playerId);
        return {
            kickedOff,
            rows:
                mine !== undefined
                    ? [
                          {
                              playerId: session.playerId,
                              displayName: session.displayName,
                              homeScore: mine.homeScore,
                              awayScore: mine.awayScore,
                              isJoker: false,
                          },
                      ]
                    : [],
        };
    };

    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
                <h1 className="font-display text-2xl uppercase tracking-widest">Matches</h1>
                <p className="mt-1 text-xs opacity-60">
                    Tap a match to expand picks and points inline.
                </p>

                <ul className="mt-6 divide-y divide-ink/15">
                    {rows.length === 0 ? (
                        <li className="py-8 text-center text-sm opacity-60">
                            No matches yet. Run the cron sync once your football-data token is set.
                        </li>
                    ) : (
                        rows.map((m) => {
                            const { kickedOff, rows: rawPredRows } = buildPredRows(m);
                            const predRows = rawPredRows
                                .map((r) => {
                                    const hasPick =
                                        r.homeScore !== null && r.awayScore !== null;
                                    const pts = hasPick
                                        ? predictionPoints(m, {
                                              homeScore: r.homeScore!,
                                              awayScore: r.awayScore!,
                                          }) * (r.isJoker ? 2 : 1)
                                        : 0;
                                    return { ...r, hasPick, pts };
                                })
                                .sort((a, b) => {
                                    if (a.pts !== b.pts) {
                                        return b.pts - a.pts;
                                    }
                                    if (a.hasPick !== b.hasPick) {
                                        return a.hasPick ? -1 : 1;
                                    }
                                    return a.displayName.localeCompare(b.displayName);
                                });
                            return (
                                <li key={m.id}>
                                    <details className="group">
                                        <summary className="flex cursor-pointer list-none items-start gap-3 py-3 text-sm hover:bg-ink/5 [&::-webkit-details-marker]:hidden">
                                            <span
                                                aria-hidden
                                                className="mt-1 font-display text-xs opacity-40 transition-transform group-open:rotate-90"
                                            >
                                                ▶
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 font-display text-[11px] uppercase tracking-wider opacity-60">
                                                    <span>{formatKickoff(m.kickoff)}</span>
                                                    <span aria-hidden>·</span>
                                                    <span>
                                                        {m.round}
                                                        {m.groupLetter !== null
                                                            ? ` ${m.groupLetter}`
                                                            : ""}
                                                    </span>
                                                    <span
                                                        className={`ml-auto ${
                                                            m.status === "LIVE"
                                                                ? "text-tournament"
                                                                : ""
                                                        }`}
                                                    >
                                                        {m.status}
                                                    </span>
                                                </div>
                                                <div className="mt-1.5">
                                                    <span className="mr-1">{flag(m.homeCode ?? "")}</span>
                                                    {m.homeName ?? "TBD"}{" "}
                                                    <span className="mx-2 font-display tabular">
                                                        {m.homeScore ?? "–"} : {m.awayScore ?? "–"}
                                                    </span>
                                                    {m.awayName ?? "TBD"}{" "}
                                                    <span className="ml-1">{flag(m.awayCode ?? "")}</span>
                                                </div>
                                                {(() => {
                                                    const subtitle = scoreSubtitle(m);
                                                    if (subtitle === null) {
                                                        return null;
                                                    }
                                                    return (
                                                        <p className="mt-0.5 font-display text-[10px] uppercase tracking-wider opacity-60">
                                                            {subtitle}
                                                        </p>
                                                    );
                                                })()}
                                            </div>
                                        </summary>

                                        <div className="border-t border-ink/10 px-2 py-3 sm:px-4">
                                            {!kickedOff ? (
                                                <p className="text-xs opacity-60">
                                                    Other players&apos; picks become visible at
                                                    kickoff.
                                                </p>
                                            ) : null}
                                            {predRows.length === 0 ? (
                                                <p className="py-2 text-center text-xs opacity-60">
                                                    {kickedOff
                                                        ? "No predictions filed."
                                                        : "You haven't picked this one."}
                                                </p>
                                            ) : (
                                                <table className="w-full text-sm tabular">
                                                    <thead className="border-b border-ink/30 text-left font-display text-[11px] uppercase tracking-wider">
                                                        <tr>
                                                            <th className="py-1.5 pr-2">Player</th>
                                                            <th className="py-1.5 pr-2 text-right">
                                                                Pick
                                                            </th>
                                                            <th className="py-1.5 pl-2 text-right">
                                                                Pts
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {predRows.map((r) => (
                                                            <tr
                                                                key={r.playerId}
                                                                className="border-b border-ink/10 last:border-b-0"
                                                            >
                                                                <td className="py-1.5 pr-2">
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
                                                                </td>
                                                                <td className="py-1.5 pr-2 text-right font-display">
                                                                    {r.hasPick ? (
                                                                        <>
                                                                            {r.homeScore} : {r.awayScore}
                                                                        </>
                                                                    ) : (
                                                                        <span className="text-[10px] uppercase opacity-50">
                                                                            no pick
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="py-1.5 pl-2 text-right font-display">
                                                                    {!r.hasPick || m.homeScore === null
                                                                        ? "–"
                                                                        : r.pts}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                            <p className="mt-3 text-right text-[11px]">
                                                <Link
                                                    href={`/matches/${m.id}` as never}
                                                    className="font-display uppercase tracking-wider opacity-60 hover:text-tournament"
                                                >
                                                    Match detail →
                                                </Link>
                                            </p>
                                        </div>
                                    </details>
                                </li>
                            );
                        })
                    )}
                </ul>
            </main>
        </>
    );
}
