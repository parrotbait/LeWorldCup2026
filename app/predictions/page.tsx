import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { matches, predictions, teams } from "@/db/schema";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { formatDayLong, formatTime, pickLockTime } from "@/lib/utils";
import { isExact, predictionPoints } from "@/lib/scoring";
import { ScoreStepper } from "./_components/score-stepper";

export const revalidate = 0;

const ROUND_LABEL: Record<string, string> = {
    GROUP: "Groups",
    R32: "Round of 32",
    R16: "Round of 16",
    QF: "Quarter-finals",
    SF: "Semi-finals",
    THIRD: "Third place",
    FINAL: "Final",
};

function lockMessage(kickoff: Date, locked: boolean, tbd: boolean): string {
    if (tbd) {
        return "teams TBD";
    }
    if (locked) {
        return "locked";
    }
    const ms = pickLockTime(kickoff) - Date.now();
    if (ms <= 0) {
        return "locked";
    }
    const totalMins = Math.floor(ms / 60_000);
    // < 1 hour → minutes
    if (totalMins < 60) {
        return `locks in ${totalMins}m`;
    }
    const totalHours = Math.floor(totalMins / 60);
    // 1 hour … under 1 day → hours (with minutes only when under 6h to keep it tidy)
    if (totalHours < 24) {
        const remainder = totalMins % 60;
        if (totalHours < 6 && remainder !== 0) {
            return `locks in ${totalHours}h ${remainder}m`;
        }
        return `locks in ${totalHours}h`;
    }
    // ≥ 1 day → days
    const days = Math.floor(totalHours / 24);
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
        .orderBy(asc(matches.kickoff));

    const myPredictions = await db
        .select()
        .from(predictions)
        .where(eq(predictions.playerId, session.playerId));
    const predByMatch = new Map(myPredictions.map((p) => [p.matchId, p]));

    // Group by matchday in the display timezone (so a 23:30 UTC match buckets
    // into the next day if that's where it lands locally).
    const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Europe/London",
    });
    const byDay = new Map<string, typeof rows>();
    for (const r of rows) {
        const key = dayKeyFmt.format(r.kickoff);
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
            <main className="mx-auto max-w-3xl px-3 py-6 sm:px-6 sm:py-8">
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
                                        {formatDayLong(day[0]!.kickoff)}
                                    </h2>
                                    <ul className="mt-3 divide-y divide-ink/15">
                                        {day.map((m) => {
                                            const pred = predByMatch.get(m.id);
                                            // TBD when either side hasn't been resolved yet
                                            // (knockout placeholders before the bracket fills).
                                            const tbd = m.homeName === null || m.awayName === null;
                                            // Locked once the match has started by either signal:
                                            // its kickoff has passed, OR the status has moved on
                                            // (cron may flip to LIVE early, or admin overrode).
                                            // Also locked while teams are TBD — there's no
                                            // meaningful pick to make against placeholders.
                                            const locked =
                                                tbd ||
                                                pickLockTime(m.kickoff) <= now ||
                                                m.status !== "SCHEDULED";
                                            const settled =
                                                m.status === "FINISHED" &&
                                                m.homeScore !== null &&
                                                m.awayScore !== null;
                                            const earned =
                                                settled && pred !== undefined
                                                    ? predictionPoints(m, {
                                                          homeScore: pred.homeScore,
                                                          awayScore: pred.awayScore,
                                                      })
                                                    : 0;
                                            const exact =
                                                settled &&
                                                pred !== undefined &&
                                                isExact(m, {
                                                    homeScore: pred.homeScore,
                                                    awayScore: pred.awayScore,
                                                });
                                            return (
                                                <li
                                                    key={m.id}
                                                    className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 py-4 text-sm sm:grid-cols-[100px_1fr] sm:gap-4"
                                                >
                                                    <div className="font-display text-xs opacity-60">
                                                        <div>{formatTime(m.kickoff)}</div>
                                                        <div className="mt-0.5 text-[10px] uppercase opacity-60">
                                                            {ROUND_LABEL[m.round]}
                                                            {m.groupLetter !== null ? ` ${m.groupLetter}` : ""}
                                                        </div>
                                                        <div className="mt-0.5 text-[10px] opacity-60">
                                                            {lockMessage(m.kickoff, locked, tbd)}
                                                        </div>
                                                    </div>

                                                    <ScoreStepper
                                                        matchId={m.id}
                                                        initialHome={pred?.homeScore ?? null}
                                                        initialAway={pred?.awayScore ?? null}
                                                        locked={locked}
                                                        homeCode={m.homeCode ?? ""}
                                                        homeName={m.homeName ?? "TBD"}
                                                        awayCode={m.awayCode ?? ""}
                                                        awayName={m.awayName ?? "TBD"}
                                                        actualHome={m.homeScore}
                                                        actualAway={m.awayScore}
                                                        earnedPoints={earned}
                                                        isExact={exact}
                                                        hasPick={pred !== undefined}
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
