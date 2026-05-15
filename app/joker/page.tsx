import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { jokers, matches, teams } from "@/db/schema";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { JokerRoundPicker } from "./_joker-round-picker";
import { formatKickoff } from "@/lib/utils";

export const revalidate = 30;

const ROUNDS: { code: "R32" | "R16" | "QF" | "SF" | "THIRD" | "FINAL"; label: string }[] = [
    { code: "R32", label: "Round of 32" },
    { code: "R16", label: "Round of 16" },
    { code: "QF", label: "Quarter-finals" },
    { code: "SF", label: "Semi-finals" },
    { code: "THIRD", label: "Third place" },
    { code: "FINAL", label: "Final" },
];

export default async function JokerPage() {
    const session = await requireSession();

    const home = alias(teams, "home");
    const away = alias(teams, "away");

    const [allMatches, myJokers] = await Promise.all([
        db
            .select({
                id: matches.id,
                kickoff: matches.kickoff,
                round: matches.round,
                homeName: home.name,
                awayName: away.name,
            })
            .from(matches)
            .leftJoin(home, eq(matches.homeTeamId, home.id))
            .leftJoin(away, eq(matches.awayTeamId, away.id))
            .orderBy(asc(matches.kickoff)),
        db.select().from(jokers).where(eq(jokers.playerId, session.playerId)),
    ]);

    const jokerByRound = new Map(myJokers.map((j) => [j.round, j.matchId]));

    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-3xl px-6 py-8">
                <h1 className="font-display text-2xl uppercase tracking-widest">Joker</h1>
                <p className="mt-1 text-xs opacity-60">
                    One match per knockout round. Doubles your prediction points for that match. Locks at the round&apos;s first kickoff.
                </p>

                <div className="mt-8 space-y-5">
                    {ROUNDS.map((r) => {
                        const roundMatches = allMatches
                            .filter((m) => m.round === r.code)
                            .map((m) => ({
                                id: m.id,
                                label: `${m.homeName ?? "TBD"} vs ${m.awayName ?? "TBD"}`,
                                kickoff: formatKickoff(m.kickoff),
                            }));
                        const earliestKickoff = allMatches.find((m) => m.round === r.code)?.kickoff;
                        const locked =
                            earliestKickoff !== undefined && earliestKickoff.getTime() <= Date.now();
                        return (
                            <JokerRoundPicker
                                key={r.code}
                                round={r.code}
                                roundLabel={r.label}
                                matches={roundMatches}
                                selectedMatchId={jokerByRound.get(r.code) ?? null}
                                locked={locked}
                            />
                        );
                    })}
                </div>
            </main>
        </>
    );
}
