import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import {
    bonusPicks,
    bonusResolutions,
    jokers,
    matches,
    players,
    predictions,
    settings,
    teams,
} from "@/db/schema";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { flag, formatKickoff } from "@/lib/utils";
import { computeBonusPointsByPlayer, predictionPoints } from "@/lib/scoring";

export const revalidate = 30;

const ROUND_LABEL: Record<string, string> = {
    GROUP: "Group",
    R32: "R32",
    R16: "R16",
    QF: "QF",
    SF: "SF",
    THIRD: "3rd",
    FINAL: "Final",
};

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function PlayerProfilePage({ params }: PageProps) {
    const session = await requireSession();
    const { id } = await params;
    const playerId = Number(id);
    if (!Number.isFinite(playerId)) {
        notFound();
    }

    const player = (await db.select().from(players).where(eq(players.id, playerId)).limit(1))[0];
    if (player === undefined) {
        notFound();
    }
    const isMe = player.id === session.playerId;

    const home = alias(teams, "home");
    const away = alias(teams, "away");

    const [allMatches, theirPredictions, theirBonuses, theirJokers, allTeams, allResolutions, settingsRow] =
        await Promise.all([
            db
                .select({
                    id: matches.id,
                    kickoff: matches.kickoff,
                    round: matches.round,
                    groupLetter: matches.groupLetter,
                    status: matches.status,
                    homeScore: matches.homeScore,
                    awayScore: matches.awayScore,
                    homeTeamId: matches.homeTeamId,
                    awayTeamId: matches.awayTeamId,
                    homeCode: home.code,
                    homeName: home.name,
                    awayCode: away.code,
                    awayName: away.name,
                })
                .from(matches)
                .leftJoin(home, eq(matches.homeTeamId, home.id))
                .leftJoin(away, eq(matches.awayTeamId, away.id))
                .orderBy(asc(matches.kickoff)),
            db.select().from(predictions).where(eq(predictions.playerId, playerId)),
            db.select().from(bonusPicks).where(eq(bonusPicks.playerId, playerId)),
            db.select().from(jokers).where(eq(jokers.playerId, playerId)),
            db.select().from(teams),
            db.select().from(bonusResolutions),
            db.select().from(settings).where(eq(settings.id, 1)).limit(1),
        ]);

    const teamById = new Map(allTeams.map((t) => [t.id, t]));
    const predByMatch = new Map(theirPredictions.map((p) => [p.matchId, p]));
    const jokerByRound = new Map(theirJokers.map((j) => [j.round, j.matchId]));

    const now = Date.now();
    const tournamentKickoff = settingsRow[0]?.tournamentKickoff;
    const tournamentStarted =
        tournamentKickoff !== undefined && tournamentKickoff.getTime() <= now;

    const theirBonusPoints =
        computeBonusPointsByPlayer({
            picks: theirBonuses.map((b) => ({
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
        }).get(playerId) ?? 0;

    let totalPredPts = 0;
    let exactCount = 0;
    const visibleRows: {
        m: (typeof allMatches)[number];
        pred: (typeof theirPredictions)[number] | undefined;
        base: number;
        pts: number;
        isJoker: boolean;
    }[] = [];
    for (const m of allMatches) {
        const pred = predByMatch.get(m.id);
        const matchKickedOff = m.kickoff.getTime() <= now;
        // Visibility gate: own profile sees everything; others only see picks
        // for matches that have already kicked off.
        if (!isMe && !matchKickedOff) {
            continue;
        }
        const base = predictionPoints(m, pred);
        const isJoker = jokerByRound.get(m.round) === m.id;
        const pts = base * (isJoker ? 2 : 1);
        totalPredPts += pts;
        if (
            pred !== undefined &&
            m.homeScore !== null &&
            m.awayScore !== null &&
            pred.homeScore === m.homeScore &&
            pred.awayScore === m.awayScore
        ) {
            exactCount += 1;
        }
        visibleRows.push({ m, pred, base, pts, isJoker });
    }
    const settledCount = visibleRows.filter((r) => r.m.homeScore !== null).length;

    const showBonuses = isMe || tournamentStarted;

    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-3xl px-6 py-8">
                <header className="flex items-baseline justify-between">
                    <div>
                        <p className="font-display text-xs uppercase tracking-[0.3em] text-tournament">
                            Player profile
                        </p>
                        <h1 className="mt-1 font-display text-2xl uppercase tracking-widest">
                            {player.displayName}
                            {isMe ? <span className="ml-3 text-xs opacity-50">(you)</span> : null}
                        </h1>
                    </div>
                    <Link href="/leaderboard" className="text-xs underline opacity-70 hover:opacity-100">
                        ← leaderboard
                    </Link>
                </header>

                <section className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-5">
                    <Stat label="Pred. pts" value={totalPredPts} />
                    <Stat label="Bonus pts" value={theirBonusPoints} />
                    <Stat label="Total" value={totalPredPts + theirBonusPoints} />
                    <Stat label="Exact" value={exactCount} />
                    <Stat label="Settled" value={settledCount} />
                </section>

                <section className="mt-10">
                    <header className="flex items-baseline justify-between">
                        <h2 className="font-display text-sm uppercase tracking-wider">
                            Predictions
                        </h2>
                        {!isMe ? (
                            <span className="font-display text-[10px] uppercase opacity-50">
                                only matches that have kicked off
                            </span>
                        ) : null}
                    </header>
                    {visibleRows.length === 0 ? (
                        <p className="mt-3 text-sm opacity-60">
                            {isMe
                                ? "You haven't filed any predictions yet."
                                : "No matches have kicked off yet — picks reveal at each match's kickoff."}
                        </p>
                    ) : (
                        <table className="mt-3 w-full text-sm tabular">
                            <thead className="border-b border-ink/30 text-left font-display text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="py-2 pr-2">When</th>
                                    <th className="py-2 pr-2">Round</th>
                                    <th className="py-2 pr-2">Match</th>
                                    <th className="py-2 pr-2 text-right">Actual</th>
                                    <th className="py-2 pr-2 text-right">Pick</th>
                                    <th className="py-2 pl-2 text-right">Pts</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map(({ m, pred, base, pts, isJoker }) => (
                                    <tr key={m.id} className="border-b border-ink/10">
                                        <td className="py-2 pr-2 text-xs opacity-70">
                                            {formatKickoff(m.kickoff)}
                                        </td>
                                        <td className="py-2 pr-2 text-xs opacity-70">
                                            {ROUND_LABEL[m.round]}
                                            {m.groupLetter !== null ? ` ${m.groupLetter}` : ""}
                                        </td>
                                        <td className="py-2 pr-2">
                                            <span className="mr-1">{flag(m.homeCode ?? "")}</span>
                                            {m.homeName ?? "TBD"} vs {m.awayName ?? "TBD"}{" "}
                                            <span className="ml-1">{flag(m.awayCode ?? "")}</span>
                                        </td>
                                        <td className="py-2 pr-2 text-right font-display">
                                            {m.homeScore === null
                                                ? "–"
                                                : `${m.homeScore} : ${m.awayScore}`}
                                        </td>
                                        <td className="py-2 pr-2 text-right font-display">
                                            {pred === undefined
                                                ? "–"
                                                : `${pred.homeScore} : ${pred.awayScore}`}
                                        </td>
                                        <td className="py-2 pl-2 text-right font-display">
                                            {pts}
                                            {isJoker && base > 0 ? (
                                                <span className="ml-1 text-[10px] text-mustard">
                                                    ×2
                                                </span>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </section>

                <section className="mt-10">
                    <header className="flex items-baseline justify-between">
                        <h2 className="font-display text-sm uppercase tracking-wider">
                            Bonus picks
                        </h2>
                        {!isMe && !tournamentStarted ? (
                            <span className="font-display text-[10px] uppercase opacity-50">
                                hidden until tournament kickoff
                            </span>
                        ) : null}
                    </header>
                    {!showBonuses ? (
                        <p className="mt-3 text-sm opacity-60">
                            Bonus picks reveal at the tournament&apos;s opening whistle.
                        </p>
                    ) : theirBonuses.length === 0 ? (
                        <p className="mt-3 text-sm opacity-60">
                            {isMe
                                ? "No bonus picks yet — head to /bonuses."
                                : "Hasn't filed any bonus picks."}
                        </p>
                    ) : (
                        <ul className="mt-3 divide-y divide-ink/15 text-sm">
                            {theirBonuses.map((b) => (
                                <li
                                    key={`${b.kind}-${b.groupLetter ?? ""}`}
                                    className="flex items-baseline justify-between py-2"
                                >
                                    <span className="font-display text-xs uppercase tracking-wider opacity-70">
                                        {b.kind.replaceAll("_", " ")}
                                    </span>
                                    <span>
                                        {b.teamId !== null
                                            ? (teamById.get(b.teamId)?.name ?? "?")
                                            : (b.playerName ?? "?")}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </main>
        </>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded border border-ink/20 p-3">
            <div className="font-display text-[10px] uppercase tracking-widest opacity-60">
                {label}
            </div>
            <div className="mt-0.5 font-display text-2xl tabular">{value}</div>
        </div>
    );
}
