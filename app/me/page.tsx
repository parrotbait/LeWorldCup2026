import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { db } from "@/db/client";
import { bonusPicks, bonusResolutions, jokers, matches, predictions, teams } from "@/db/schema";
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

export default async function MePage() {
    const session = await requireSession();

    const home = alias(teams, "home");
    const away = alias(teams, "away");

    const [allMatches, myPredictions, myBonuses, myJokers, allTeams, allResolutions] = await Promise.all([
        db
            .select({
                id: matches.id,
                kickoff: matches.kickoff,
                round: matches.round,
                groupLetter: matches.groupLetter,
                homeScore: matches.homeScore,
                awayScore: matches.awayScore,
                status: matches.status,
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
        db.select().from(predictions).where(eq(predictions.playerId, session.playerId)),
        db.select().from(bonusPicks).where(eq(bonusPicks.playerId, session.playerId)),
        db.select().from(jokers).where(eq(jokers.playerId, session.playerId)),
        db.select().from(teams),
        db.select().from(bonusResolutions),
    ]);

    const myBonusPoints =
        computeBonusPointsByPlayer({
            picks: myBonuses.map((b) => ({
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
        }).get(session.playerId) ?? 0;

    const teamById = new Map(allTeams.map((t) => [t.id, t]));
    const predByMatch = new Map(myPredictions.map((p) => [p.matchId, p]));
    const jokerByRound = new Map(myJokers.map((j) => [j.round, j.matchId]));

    let totalPredPts = 0;
    let exactCount = 0;
    const rows = allMatches.map((m) => {
        const pred = predByMatch.get(m.id);
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
        return { m, pred, base, pts, isJoker };
    });

    const settledRows = rows.filter((r) => r.m.homeScore !== null);

    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-3xl px-6 py-8">
                <header>
                    <h1 className="font-display text-2xl uppercase tracking-widest">{session.displayName}</h1>
                    <p className="mt-1 text-xs opacity-60">
                        Your full breakdown — predictions, bonuses, jokers.
                    </p>
                </header>

                <section className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-5">
                    <Stat label="Pred. pts" value={totalPredPts} />
                    <Stat label="Bonus pts" value={myBonusPoints} />
                    <Stat label="Total" value={totalPredPts + myBonusPoints} />
                    <Stat label="Exact" value={exactCount} />
                    <Stat label="Settled" value={settledRows.length} />
                </section>

                <section className="mt-10">
                    <h2 className="font-display text-sm uppercase tracking-wider">Predictions</h2>
                    <table className="mt-3 w-full text-sm tabular">
                        <thead className="border-b border-ink/30 text-left font-display text-xs uppercase tracking-wider">
                            <tr>
                                <th className="py-2 pr-2">When</th>
                                <th className="py-2 pr-2">Round</th>
                                <th className="py-2 pr-2">Match</th>
                                <th className="py-2 pr-2 text-right">Actual</th>
                                <th className="py-2 pr-2 text-right">My pick</th>
                                <th className="py-2 pl-2 text-right">Pts</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(({ m, pred, base, pts, isJoker }) => (
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
                                        {pred === undefined
                                            ? "–"
                                            : `${pred.homeScore} : ${pred.awayScore}`}
                                    </td>
                                    <td className="py-2 pl-2 text-right font-display">
                                        {pts}
                                        {isJoker && base > 0 ? (
                                            <span className="ml-1 text-[10px] text-mustard">×2</span>
                                        ) : null}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                <section className="mt-10">
                    <h2 className="font-display text-sm uppercase tracking-wider">Bonus picks</h2>
                    {myBonuses.length === 0 ? (
                        <p className="mt-2 text-sm opacity-60">No bonus picks yet — head to /bonuses.</p>
                    ) : (
                        <ul className="mt-3 divide-y divide-ink/15 text-sm">
                            {myBonuses.map((b) => (
                                <li key={`${b.kind}-${b.groupLetter ?? ""}`} className="flex items-baseline justify-between py-2">
                                    <span className="font-display text-xs uppercase tracking-wider opacity-70">
                                        {b.kind.replace("_", " ")}
                                        {b.groupLetter !== null && b.groupLetter !== "" ? ` (Group ${b.groupLetter})` : ""}
                                    </span>
                                    <span>
                                        {b.teamId !== null
                                            ? teamById.get(b.teamId)?.name ?? "?"
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
            <div className="font-display text-[10px] uppercase tracking-widest opacity-60">{label}</div>
            <div className="mt-0.5 font-display text-2xl tabular">{value}</div>
        </div>
    );
}
