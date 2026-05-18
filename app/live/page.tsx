import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { db } from "@/db/client";
import { jokers, matches, players, predictions, teams } from "@/db/schema";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { flag, formatKickoff } from "@/lib/utils";
import { isExact, predictionPoints } from "@/lib/scoring";

// Always fresh — match scores tick during play and the page is the live one.
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

export default async function LivePage() {
    await requireSession();

    // "Recently" = anything that kicked off in the last 24h. Tweak if needed.
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const until = new Date(Date.now() + 5 * 60_000);

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
                and(
                    eq(matches.status, "FINISHED"),
                    gte(matches.kickoff, since),
                    lte(matches.kickoff, until),
                ),
            ),
        )
        .orderBy(asc(matches.kickoff));

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
                <header>
                    <h1 className="font-display text-2xl uppercase tracking-widest">Live</h1>
                    <p className="mt-1 text-xs opacity-60">
                        In-play and recently-finished matches. Picks revealed at kickoff. Live
                        points reflect the current scoreline — they finalise at full-time.
                    </p>
                </header>

                {liveOrRecent.length === 0 ? (
                    <p className="mt-12 text-center text-sm opacity-60">
                        No live action right now.
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
                                                    {m.homeScore ?? 0} – {m.awayScore ?? 0}
                                                </span>
                                                {m.awayName ?? "TBD"}
                                                <span className="ml-2">{flag(m.awayCode ?? "")}</span>
                                            </h2>
                                        </div>
                                        <span
                                            className={`font-display text-[10px] uppercase tracking-widest ${
                                                m.status === "LIVE"
                                                    ? "text-tournament"
                                                    : "opacity-60"
                                            }`}
                                        >
                                            {m.status === "LIVE" ? "● live" : "full time"}
                                        </span>
                                    </header>

                                    {rows.length === 0 ? (
                                        <p className="px-4 py-6 text-center text-xs opacity-60">
                                            No players in the league yet.
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
