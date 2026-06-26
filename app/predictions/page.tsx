import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { matches, predictions, teams, type Match, type Prediction } from "@/db/schema";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { formatDayLong, formatTime, pickLockTime } from "@/lib/utils";
import { isExact, predictionPoints } from "@/lib/scoring";
import { getOpenPredictionDeadline } from "@/lib/predictions";
import { ScoreStepper } from "./_components/score-stepper";
import { ScrollToDay } from "./_components/scroll-to-day";

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
    const todayKey = dayKeyFmt.format(new Date(now));
    // Only group-stage and R32 days get tucked away once they're done — the
    // later knockout rounds stay visible because they're worth re-checking.
    const HIDEABLE_ROUNDS = new Set(["GROUP", "R32"]);
    const isHideable = (k: string) =>
        k < todayKey && byDay.get(k)!.every((m) => HIDEABLE_ROUNDS.has(m.round));
    const pastKeys = dayKeys.filter(isHideable);
    const visibleKeys = dayKeys.filter((k) => !isHideable(k));
    // Land the user at today if it has matches, otherwise the next upcoming
    // day — and if the tournament is over, the most recent past day.
    const upcomingOrLater = visibleKeys.find((k) => k >= todayKey);
    const anchorKey =
        upcomingOrLater ?? visibleKeys[visibleKeys.length - 1] ?? null;

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

                {(() => {
                    const deadline = getOpenPredictionDeadline(
                        rows,
                        new Set(predByMatch.keys()),
                        now,
                    );
                    if (deadline === null) {
                        return null;
                    }
                    const totalMins = Math.floor(deadline.nextLockMs / 60_000);
                    const h = Math.floor(totalMins / 60);
                    const m = totalMins % 60;
                    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
                    return (
                        <div className="mt-4 flex items-center gap-2 rounded border border-mustard/40 bg-mustard/10 px-3 py-2 text-xs">
                            <span className="font-display text-mustard">⏱</span>
                            <span>
                                <strong>{deadline.openCount}</strong> {deadline.openCount === 1 ? "pick" : "picks"} still open
                                — next locks in <strong>{timeStr}</strong>
                            </span>
                        </div>
                    );
                })()}

                {rows.length === 0 ? (
                    <p className="mt-12 text-center text-sm opacity-60">
                        No fixtures loaded yet. Once the football-data sync runs,
                        every match will appear here.
                    </p>
                ) : (
                    <div className="mt-8 space-y-10">
                        {pastKeys.length > 0 && (
                            <details className="group">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-display text-xs uppercase tracking-[0.25em] opacity-60 hover:opacity-100">
                                    <span>
                                        Group stage &amp; R32 ({pastKeys.length} {pastKeys.length === 1 ? "day" : "days"})
                                    </span>
                                    <span className="text-[10px] opacity-60 group-open:hidden">tap to show</span>
                                    <span className="hidden text-[10px] opacity-60 group-open:inline">tap to hide</span>
                                </summary>
                                <div className="mt-8 space-y-10">
                                    {pastKeys.map((key) => renderDay(key, byDay.get(key)!, predByMatch, now))}
                                </div>
                            </details>
                        )}
                        {visibleKeys.map((key) =>
                            renderDay(key, byDay.get(key)!, predByMatch, now),
                        )}
                    </div>
                )}
                {anchorKey !== null && <ScrollToDay dayKey={anchorKey} />}
            </main>
        </>
    );
}

function renderDay(
    key: string,
    day: Array<{
        id: number;
        kickoff: Date;
        round: Match["round"];
        groupLetter: string | null;
        status: Match["status"];
        homeScore: number | null;
        awayScore: number | null;
        homeScoreFt: number | null;
        awayScoreFt: number | null;
        homeScorePens: number | null;
        awayScorePens: number | null;
        homeTeamId: number | null;
        awayTeamId: number | null;
        winnerTeamId: number | null;
        homeCode: string | null;
        homeName: string | null;
        awayCode: string | null;
        awayName: string | null;
    }>,
    predByMatch: Map<number, Prediction>,
    now: number,
) {
    return (
        <section key={key} id={`day-${key}`} className="scroll-mt-4">
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
                            className="flex flex-col gap-2 py-4 text-sm sm:grid sm:grid-cols-[100px_1fr] sm:items-center sm:gap-4"
                        >
                            {/* Mobile: horizontal strip above the stepper. Desktop: vertical stack in the left column. */}
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-display text-[11px] uppercase opacity-70 sm:block sm:text-xs sm:opacity-60">
                                <span>{formatTime(m.kickoff)}</span>
                                <span className="opacity-60 sm:mt-0.5 sm:block sm:text-[10px]">
                                    {ROUND_LABEL[m.round]}
                                    {m.groupLetter !== null ? ` ${m.groupLetter}` : ""}
                                </span>
                                <span className="opacity-60 sm:mt-0.5 sm:block sm:text-[10px]">
                                    {lockMessage(m.kickoff, locked, tbd)}
                                </span>
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
                                matchStatus={m.status}
                                actualHome={m.homeScore}
                                actualAway={m.awayScore}
                                actualHomeFt={m.homeScoreFt}
                                actualAwayFt={m.awayScoreFt}
                                actualHomePens={m.homeScorePens}
                                actualAwayPens={m.awayScorePens}
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
}
