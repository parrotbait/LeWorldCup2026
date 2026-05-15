import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { matches, predictions, teams } from "@/db/schema";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { flag } from "@/lib/utils";
import { ScoreStepper } from "./_components/score-stepper";

export const revalidate = 30;

const ROUND_LABEL: Record<string, string> = {
    GROUP: "Groups",
    R32: "Round of 32",
    R16: "Round of 16",
    QF: "Quarter-finals",
    SF: "Semi-finals",
    THIRD: "Third place",
    FINAL: "Final",
};

function matchdayLabel(d: Date): string {
    return d.toLocaleDateString("en-IE", {
        weekday: "long",
        day: "2-digit",
        month: "long",
    });
}

function timeLabel(d: Date): string {
    return d.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" });
}

function lockMessage(kickoff: Date): string {
    const ms = kickoff.getTime() - Date.now();
    if (ms <= 0) {
        return "locked";
    }
    const mins = Math.floor(ms / 60_000);
    if (mins < 60) {
        return `locks in ${mins}m`;
    }
    const hours = Math.floor(mins / 60);
    if (hours < 48) {
        return `locks in ${hours}h ${mins % 60}m`;
    }
    const days = Math.floor(hours / 24);
    return `locks in ${days}d`;
}

export default async function PredictionsPage() {
    const session = await requireSession();

    const home = alias(teams, "home");
    const away = alias(teams, "away");

    const rows = await db
        .select({
            id: matches.id,
            kickoff: matches.kickoff,
            round: matches.round,
            groupLetter: matches.groupLetter,
            homeCode: home.code,
            homeName: home.name,
            awayCode: away.code,
            awayName: away.name,
        })
        .from(matches)
        .leftJoin(home, eq(matches.homeTeamId, home.id))
        .leftJoin(away, eq(matches.awayTeamId, away.id))
        .orderBy(asc(matches.kickoff));

    const myPredictions = await db
        .select()
        .from(predictions)
        .where(eq(predictions.playerId, session.playerId));
    const predByMatch = new Map(myPredictions.map((p) => [p.matchId, p]));

    // Group by matchday.
    const byDay = new Map<string, typeof rows>();
    for (const r of rows) {
        const key = r.kickoff.toISOString().slice(0, 10);
        const arr = byDay.get(key);
        if (arr === undefined) {
            byDay.set(key, [r]);
        } else {
            arr.push(r);
        }
    }
    const dayKeys = Array.from(byDay.keys()).sort();

    const now = Date.now();

    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-3xl px-6 py-8">
                <header>
                    <h1 className="font-display text-2xl uppercase tracking-widest">Predictions</h1>
                    <p className="mt-1 text-xs opacity-60">
                        Auto-saves as you tap. Each match locks at its own kickoff.
                    </p>
                </header>

                {rows.length === 0 ? (
                    <p className="mt-12 text-center text-sm opacity-60">
                        No fixtures loaded yet. Once the football-data sync runs,
                        every match will appear here.
                    </p>
                ) : (
                    <div className="mt-8 space-y-10">
                        {dayKeys.map((key) => {
                            const day = byDay.get(key)!;
                            return (
                                <section key={key}>
                                    <h2 className="font-display text-xs uppercase tracking-[0.25em] text-tournament">
                                        {matchdayLabel(day[0]!.kickoff)}
                                    </h2>
                                    <ul className="mt-3 divide-y divide-ink/15">
                                        {day.map((m) => {
                                            const pred = predByMatch.get(m.id);
                                            const locked = m.kickoff.getTime() <= now;
                                            return (
                                                <li
                                                    key={m.id}
                                                    className="grid grid-cols-[80px_1fr_auto] items-center gap-4 py-4 text-sm"
                                                >
                                                    <div className="font-display text-xs opacity-60">
                                                        <div>{timeLabel(m.kickoff)}</div>
                                                        <div className="mt-0.5 text-[10px] uppercase opacity-60">
                                                            {ROUND_LABEL[m.round]}
                                                            {m.groupLetter !== null ? ` ${m.groupLetter}` : ""}
                                                        </div>
                                                        <div className="mt-0.5 text-[10px] opacity-60">
                                                            {lockMessage(m.kickoff)}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <span className="text-lg">{flag(m.homeCode ?? "")}</span>
                                                        <span className="flex-1 font-medium">
                                                            {m.homeName ?? "TBD"}
                                                        </span>
                                                        <span className="opacity-40">vs</span>
                                                        <span className="flex-1 text-right font-medium">
                                                            {m.awayName ?? "TBD"}
                                                        </span>
                                                        <span className="text-lg">{flag(m.awayCode ?? "")}</span>
                                                    </div>

                                                    <ScoreStepper
                                                        matchId={m.id}
                                                        initialHome={pred?.homeScore ?? null}
                                                        initialAway={pred?.awayScore ?? null}
                                                        locked={locked}
                                                    />
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>
                            );
                        })}
                    </div>
                )}
            </main>
        </>
    );
}
