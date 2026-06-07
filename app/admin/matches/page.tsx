import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { db } from "@/db/client";
import { matches, teams } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { flag, formatKickoff } from "@/lib/utils";
import { ScoreOverrideForm } from "./_score-override-form";

export const revalidate = 0;

export default async function AdminMatchesPage() {
    await requireAdmin();

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
            adminOverridden: matches.adminOverridden,
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
        <main className="mx-auto max-w-5xl px-6 py-8">
            <header className="flex items-baseline justify-between">
                <h1 className="font-display text-2xl uppercase tracking-widest">
                    Admin · Match scores
                </h1>
                <Link href="/admin/dashboard" className="text-xs underline">
                    ← dashboard
                </Link>
            </header>
            <p className="mt-2 text-sm opacity-70">
                Override any match score. Setting a score marks it as admin-overridden so the
                cron sync won&apos;t clobber it.
            </p>

            <ul className="mt-6 divide-y divide-ink/15">
                {rows.length === 0 ? (
                    <li className="py-8 text-center text-sm opacity-60">
                        No matches loaded yet — run sync first.
                    </li>
                ) : (
                    rows.map((m) => (
                        <li key={m.id} className="grid grid-cols-[140px_1fr_auto] items-center gap-4 py-3 text-sm">
                            <div className="font-display text-xs opacity-70">
                                <div>{formatKickoff(m.kickoff)}</div>
                                <div className="mt-0.5 text-[10px] uppercase opacity-60">
                                    {m.round}
                                    {m.groupLetter !== null ? ` ${m.groupLetter}` : ""}
                                </div>
                            </div>
                            <div>
                                <span className="mr-1">{flag(m.homeCode ?? "")}</span>
                                {m.homeName ?? "TBD"} vs {m.awayName ?? "TBD"}{" "}
                                <span className="ml-1">{flag(m.awayCode ?? "")}</span>
                            </div>
                            <ScoreOverrideForm
                                matchId={m.id}
                                initialHome={m.homeScore}
                                initialAway={m.awayScore}
                                overridden={m.adminOverridden}
                                homeName={m.homeName ?? "TBD"}
                                awayName={m.awayName ?? "TBD"}
                            />
                        </li>
                    ))
                )}
            </ul>
        </main>
    );
}
