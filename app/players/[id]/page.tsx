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
    teams,
} from "@/db/schema";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { flag, formatKickoff, pickLockTime } from "@/lib/utils";
import {
    computeBonusBreakdownByPlayer,
    computeBonusPointsByPlayer,
    predictionPoints,
    type BonusBreakdownEntry,
} from "@/lib/scoring";
import { getBonusLockState } from "@/lib/bonus-lock";

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

    const [allMatches, theirPredictions, theirBonuses, theirJokers, allTeams, allResolutions, lockState] =
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
            db.select().from(predictions).where(eq(predictions.playerId, playerId)),
            db.select().from(bonusPicks).where(eq(bonusPicks.playerId, playerId)),
            db.select().from(jokers).where(eq(jokers.playerId, playerId)),
            db.select().from(teams),
            db.select().from(bonusResolutions),
            getBonusLockState(),
        ]);

    const teamById = new Map(allTeams.map((t) => [t.id, t]));
    const predByMatch = new Map(theirPredictions.map((p) => [p.matchId, p]));
    const jokerByRound = new Map(theirJokers.map((j) => [j.round, j.matchId]));

    const now = Date.now();
    // Bonuses reveal at the bonus deadline — same boundary the server uses
    // to lock writes — to prevent late-fillers from copying others' picks
    // during the grace window.
    const bonusesRevealed = lockState.locked;

    const bonusInput = {
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
    };

    const theirBonusPoints =
        computeBonusPointsByPlayer(bonusInput).get(playerId) ?? 0;

    const theirBonusBreakdown =
        computeBonusBreakdownByPlayer({
            ...bonusInput,
            teamLookup: teamById,
        }).get(playerId) ?? [];

    let totalPredPts = 0;
    let predictionsFiled = 0;
    interface Row {
        m: (typeof allMatches)[number];
        pred: (typeof theirPredictions)[number] | undefined;
        base: number;
        pts: number;
        isJoker: boolean;
        revealed: boolean; // are we allowed to show the actual scoreline?
    }
    const rows: Row[] = allMatches.map((m) => {
        const pred = predByMatch.get(m.id);
        if (pred !== undefined) {
            predictionsFiled += 1;
        }
        const matchKickedOff =
            pickLockTime(m.kickoff) <= now || m.status !== "SCHEDULED";
        const revealed = isMe || matchKickedOff;
        const base = predictionPoints(m, pred);
        const isJoker = jokerByRound.get(m.round) === m.id;
        const pts = base * (isJoker ? 2 : 1);
        if (revealed) {
            totalPredPts += pts;
        }
        return { m, pred, base, pts, isJoker, revealed };
    });
    const settledCount = rows.filter((r) => r.revealed && r.m.homeScore !== null).length;

    const showBonuses = isMe || bonusesRevealed;

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
                    <Stat label="Filed" value={predictionsFiled} />
                    <Stat label="Settled" value={settledCount} />
                </section>

                {showBonuses && theirBonusBreakdown.length > 0 ? (
                    <BonusBreakdownTable entries={theirBonusBreakdown} />
                ) : null}

                <section className="mt-10">
                    <header className="flex items-baseline justify-between">
                        <h2 className="font-display text-sm uppercase tracking-wider">
                            Predictions
                        </h2>
                        {!isMe ? (
                            <span className="font-display text-[10px] uppercase opacity-50">
                                scorelines reveal at each match&apos;s kickoff
                            </span>
                        ) : null}
                    </header>
                    {rows.length === 0 ? (
                        <p className="mt-3 text-sm opacity-60">No fixtures loaded yet.</p>
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
                                {rows.map(({ m, pred, base, pts, isJoker, revealed }) => (
                                    <tr key={m.id} className="border-b border-ink/10 hover:bg-ink/5">
                                        <td className="py-2 pr-2 text-xs opacity-70">
                                            <Link
                                                href={`/matches/${m.id}` as never}
                                                className="hover:text-tournament hover:underline"
                                            >
                                                {formatKickoff(m.kickoff)}
                                            </Link>
                                        </td>
                                        <td className="py-2 pr-2 text-xs opacity-70">
                                            {ROUND_LABEL[m.round]}
                                            {m.groupLetter !== null ? ` ${m.groupLetter}` : ""}
                                        </td>
                                        <td className="py-2 pr-2">
                                            <Link
                                                href={`/matches/${m.id}` as never}
                                                className="hover:text-tournament hover:underline"
                                            >
                                                <span className="mr-1">{flag(m.homeCode ?? "")}</span>
                                                {m.homeName ?? "TBD"} vs {m.awayName ?? "TBD"}{" "}
                                                <span className="ml-1">{flag(m.awayCode ?? "")}</span>
                                            </Link>
                                        </td>
                                        <td className="py-2 pr-2 text-right font-display">
                                            {m.homeScore === null
                                                ? "–"
                                                : `${m.homeScore} : ${m.awayScore}`}
                                        </td>
                                        <td className="py-2 pr-2 text-right font-display">
                                            {revealed ? (
                                                pred === undefined ? (
                                                    <span className="opacity-30">–</span>
                                                ) : (
                                                    `${pred.homeScore} : ${pred.awayScore}`
                                                )
                                            ) : pred === undefined ? (
                                                <span className="opacity-30">–</span>
                                            ) : (
                                                <span className="opacity-50" title="Picks reveal at kickoff">
                                                    ✓ filed
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2 pl-2 text-right font-display">
                                            {revealed ? (
                                                pts > 0 ? (
                                                    <>
                                                        {pts}
                                                        {isJoker && base > 0 ? (
                                                            <span className="ml-1 text-[10px] text-mustard">
                                                                ×2
                                                            </span>
                                                        ) : null}
                                                    </>
                                                ) : m.homeScore === null ? (
                                                    <span className="opacity-30">–</span>
                                                ) : (
                                                    "0"
                                                )
                                            ) : (
                                                <span className="opacity-30">–</span>
                                            )}
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
                        {!isMe && !bonusesRevealed ? (
                            <span className="font-display text-[10px] uppercase opacity-50">
                                hidden until bonus deadline
                            </span>
                        ) : null}
                    </header>
                    {!showBonuses ? (
                        <p className="mt-3 text-sm opacity-60">
                            Bonus picks reveal once the bonus deadline has passed.
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

function BonusBreakdownTable({ entries }: { entries: BonusBreakdownEntry[] }) {
    const total = entries.reduce((acc, e) => acc + e.points, 0);
    return (
        <section className="mt-6">
            <h2 className="font-display text-sm uppercase tracking-wider">
                Points breakdown
            </h2>
            <table className="mt-3 w-full text-sm tabular">
                <thead className="border-b border-ink/30 text-left font-display text-xs uppercase tracking-wider">
                    <tr>
                        <th className="py-2 pr-2">Bonus</th>
                        <th className="py-2 pr-2">Pick</th>
                        <th className="py-2 pl-2 text-right">Pts</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((e) => (
                        <tr
                            key={`${e.kind}-${e.groupLetter ?? ""}`}
                            className="border-b border-ink/10"
                        >
                            <td className="py-2 pr-2 text-xs opacity-70">
                                {e.label}
                            </td>
                            <td className="py-2 pr-2">{e.pick}</td>
                            <td className="py-2 pl-2 text-right font-display">
                                {e.points > 0 ? (
                                    <span className="text-emerald-700">{e.points}</span>
                                ) : (
                                    <span className="opacity-30">0</span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
                <tfoot className="border-t border-ink/30">
                    <tr>
                        <td className="py-2 pr-2 font-display text-xs uppercase tracking-wider">
                            Total
                        </td>
                        <td />
                        <td className="py-2 pl-2 text-right font-display font-bold">
                            {total}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </section>
    );
}
