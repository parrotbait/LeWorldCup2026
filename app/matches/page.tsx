import { db } from "@/db/client";
import { matches, teams } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { flag, formatKickoff } from "@/lib/utils";

export const revalidate = 30;

export default async function MatchesPage() {
    await requireSession();

    const home = alias(teams, "home");
    const away = alias(teams, "away");

    const rows = await db
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
        .orderBy(asc(matches.kickoff));

    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-3xl px-6 py-8">
                <h1 className="font-display text-2xl uppercase tracking-widest">Matches</h1>
                <p className="mt-1 text-xs opacity-60">
                    Picks UI lands here next. For now: tournament fixtures and live results.
                </p>

                <ul className="mt-6 divide-y divide-ink/15">
                    {rows.length === 0 ? (
                        <li className="py-8 text-center text-sm opacity-60">
                            No matches yet. Run the cron sync once your football-data token is set.
                        </li>
                    ) : (
                        rows.map((m) => (
                            <li key={m.id} className="flex items-center gap-3 py-3 text-sm">
                                <span className="w-32 font-display text-xs uppercase opacity-60">
                                    {formatKickoff(m.kickoff)}
                                </span>
                                <span className="w-16 font-display text-xs opacity-50">
                                    {m.round}
                                    {m.groupLetter !== null ? ` ${m.groupLetter}` : ""}
                                </span>
                                <span className="flex-1">
                                    <span className="mr-1">{flag(m.homeCode ?? "")}</span>
                                    {m.homeName ?? "TBD"}{" "}
                                    <span className="mx-2 font-display tabular">
                                        {m.homeScore ?? "–"} : {m.awayScore ?? "–"}
                                    </span>
                                    {m.awayName ?? "TBD"}{" "}
                                    <span className="ml-1">{flag(m.awayCode ?? "")}</span>
                                </span>
                                <span className="font-display text-[10px] uppercase opacity-50">{m.status}</span>
                            </li>
                        ))
                    )}
                </ul>
            </main>
        </>
    );
}
