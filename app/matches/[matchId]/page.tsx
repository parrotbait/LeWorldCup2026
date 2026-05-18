import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { jokers, matches, players, predictions, teams } from "@/db/schema";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { flag, formatKickoffLong } from "@/lib/utils";
import { predictionPoints } from "@/lib/scoring";

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

interface PageProps {
    params: Promise<{ matchId: string }>;
}

export default async function MatchDetailPage({ params }: PageProps) {
    const session = await requireSession();
    const { matchId: idStr } = await params;
    const matchId = Number(idStr);
    if (!Number.isFinite(matchId)) {
        notFound();
    }

    const home = alias(teams, "home");
    const away = alias(teams, "away");

    const matchRow = (
        await db
            .select({
                id: matches.id,
                kickoff: matches.kickoff,
                round: matches.round,
                groupLetter: matches.groupLetter,
                homeScore: matches.homeScore,
                awayScore: matches.awayScore,
                status: matches.status,
                venue: matches.venue,
                homeCode: home.code,
                homeName: home.name,
                awayCode: away.code,
                awayName: away.name,
            })
            .from(matches)
            .leftJoin(home, eq(matches.homeTeamId, home.id))
            .leftJoin(away, eq(matches.awayTeamId, away.id))
            .where(eq(matches.id, matchId))
            .limit(1)
    )[0];

    if (matchRow === undefined) {
        notFound();
    }

    // Reveal everyone's picks if either signal says the match has started:
    // kickoff has passed OR status has moved off SCHEDULED (LIVE/FINISHED).
    const kickedOff =
        matchRow.kickoff.getTime() <= Date.now() || matchRow.status !== "SCHEDULED";

    // Visibility gate: until kickoff, players see only their own pick.
    let predRows: { displayName: string; playerId: number; homeScore: number; awayScore: number; isJoker: boolean }[] = [];
    if (kickedOff) {
        const all = await db
            .select({
                playerId: players.id,
                displayName: players.displayName,
                homeScore: predictions.homeScore,
                awayScore: predictions.awayScore,
            })
            .from(predictions)
            .innerJoin(players, eq(predictions.playerId, players.id))
            .where(eq(predictions.matchId, matchId));
        const jokerForRound = await db
            .select()
            .from(jokers)
            .where(eq(jokers.round, matchRow.round));
        const jokerByPlayer = new Map(jokerForRound.map((j) => [j.playerId, j.matchId]));
        predRows = all.map((p) => ({
            ...p,
            isJoker: jokerByPlayer.get(p.playerId) === matchId,
        }));
    } else {
        const mine = await db
            .select()
            .from(predictions)
            .where(
                and(
                    eq(predictions.matchId, matchId),
                    eq(predictions.playerId, session.playerId),
                ),
            );
        for (const p of mine) {
            predRows.push({
                playerId: session.playerId,
                displayName: session.displayName,
                homeScore: p.homeScore,
                awayScore: p.awayScore,
                isJoker: false,
            });
        }
    }

    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-2xl px-6 py-8">
                <p className="font-display text-xs uppercase tracking-[0.25em] text-tournament">
                    {ROUND_LABEL[matchRow.round]}
                    {matchRow.groupLetter !== null ? ` · Group ${matchRow.groupLetter}` : ""}
                </p>
                <h1 className="mt-2 font-display text-3xl tabular">
                    <span className="mr-2">{flag(matchRow.homeCode ?? "")}</span>
                    {matchRow.homeName ?? "TBD"}
                    <span className="mx-3 opacity-40">
                        {matchRow.homeScore !== null && matchRow.awayScore !== null
                            ? `${matchRow.homeScore} : ${matchRow.awayScore}`
                            : "vs"}
                    </span>
                    {matchRow.awayName ?? "TBD"}
                    <span className="ml-2">{flag(matchRow.awayCode ?? "")}</span>
                </h1>
                <p className="mt-2 text-xs opacity-60">
                    {formatKickoffLong(matchRow.kickoff)}
                    {matchRow.venue !== null ? ` · ${matchRow.venue}` : ""} · {matchRow.status}
                </p>

                <section className="mt-8">
                    <h2 className="font-display text-sm uppercase tracking-wider">
                        {kickedOff ? "Picks" : "Your pick"}
                    </h2>
                    {!kickedOff ? (
                        <p className="mt-1 text-xs opacity-60">
                            Other players&apos; picks become visible at kickoff.
                        </p>
                    ) : null}
                    <table className="mt-4 w-full text-sm tabular">
                        <thead className="border-b border-ink/30 text-left font-display text-xs uppercase tracking-wider">
                            <tr>
                                <th className="py-2 pr-2">Player</th>
                                <th className="py-2 pr-2 text-right">Pick</th>
                                <th className="py-2 pl-2 text-right">Pts</th>
                            </tr>
                        </thead>
                        <tbody>
                            {predRows.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="py-6 text-center text-xs opacity-60">
                                        No predictions yet.
                                    </td>
                                </tr>
                            ) : (
                                predRows
                                    .map((r) => ({
                                        ...r,
                                        pts:
                                            predictionPoints(matchRow, {
                                                homeScore: r.homeScore,
                                                awayScore: r.awayScore,
                                            }) * (r.isJoker ? 2 : 1),
                                    }))
                                    .sort((a, b) => b.pts - a.pts)
                                    .map((r) => (
                                        <tr key={r.playerId} className="border-b border-ink/10">
                                            <td className="py-2 pr-2">
                                                {r.displayName}
                                                {r.isJoker ? (
                                                    <span className="ml-2 font-display text-[10px] text-mustard">
                                                        joker ×2
                                                    </span>
                                                ) : null}
                                            </td>
                                            <td className="py-2 pr-2 text-right font-display">
                                                {r.homeScore} : {r.awayScore}
                                            </td>
                                            <td className="py-2 pl-2 text-right font-display">
                                                {matchRow.homeScore === null ? "–" : r.pts}
                                            </td>
                                        </tr>
                                    ))
                            )}
                        </tbody>
                    </table>
                </section>

                <p className="mt-10 text-sm">
                    <Link href="/matches" className="underline">← all matches</Link>
                </p>
            </main>
        </>
    );
}
