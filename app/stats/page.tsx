import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db/client";
import { auditLog, matches, teams } from "@/db/schema";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { fetchScorers, type FdScorer } from "@/lib/football-data";
import { findPlayer } from "@/lib/players";
import { flag } from "@/lib/utils";

export const revalidate = 300;

interface ConcededRow {
    teamId: number;
    code: string;
    name: string;
    conceded: number;
    matchesPlayed: number;
}

async function loadConceded(): Promise<ConcededRow[]> {
    const allTeams = await db.select().from(teams);
    const allMatches = await db
        .select()
        .from(matches)
        .where(eq(matches.status, "FINISHED"));

    const byId = new Map<number, ConcededRow>();
    for (const t of allTeams) {
        byId.set(t.id, {
            teamId: t.id,
            code: t.code,
            name: t.name,
            conceded: 0,
            matchesPlayed: 0,
        });
    }
    for (const m of allMatches) {
        if (
            m.homeTeamId === null ||
            m.awayTeamId === null ||
            m.homeScore === null ||
            m.awayScore === null
        ) {
            continue;
        }
        const home = byId.get(m.homeTeamId);
        const away = byId.get(m.awayTeamId);
        if (home !== undefined) {
            home.conceded += m.awayScore;
            home.matchesPlayed += 1;
        }
        if (away !== undefined) {
            away.conceded += m.homeScore;
            away.matchesPlayed += 1;
        }
    }

    return Array.from(byId.values())
        .filter((r) => r.matchesPlayed > 0)
        .sort((a, b) => b.conceded - a.conceded || b.matchesPlayed - a.matchesPlayed);
}

async function fetchScorersOrNull(): Promise<FdScorer[] | null> {
    try {
        return await fetchScorers();
    } catch {
        return null;
    }
}

export default async function StatsPage() {
    await requireSession();

    const [scorers, conceded, lastSync] = await Promise.all([
        fetchScorersOrNull(),
        loadConceded(),
        db
            .select({ at: auditLog.at })
            .from(auditLog)
            .where(eq(auditLog.action, "sync-results"))
            .orderBy(desc(auditLog.id))
            .limit(1),
    ]);

    const topScorers = scorers === null
        ? null
        : [...scorers]
              .filter((s) => s.goals > 0)
              .sort((a, b) => b.goals - a.goals || (b.assists ?? 0) - (a.assists ?? 0))
              .slice(0, 10);

    const assistsAvailable = scorers !== null && scorers.some((s) => s.assists !== null && s.assists > 0);
    const topAssists = scorers === null || !assistsAvailable
        ? null
        : [...scorers]
              .filter((s) => (s.assists ?? 0) > 0)
              .sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0) || b.goals - a.goals)
              .slice(0, 10);

    const lastSyncAt = lastSync[0]?.at ?? null;

    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
                <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <h1 className="font-display text-2xl uppercase tracking-widest">Stats</h1>
                    <Link href="/bonuses" className="text-xs underline opacity-60 hover:text-tournament">
                        ← bonuses
                    </Link>
                </header>
                <p className="mt-1 text-xs opacity-60">
                    Live numbers feeding the &ldquo;currently leading&rdquo; chips on /bonuses. Goals
                    and assists from football-data.org; goals conceded from our own results table.
                </p>

                <section className="mt-8">
                    <h2 className="font-display text-sm uppercase tracking-[0.25em] text-tournament">
                        Top scorers (Golden Boot)
                    </h2>
                    {topScorers === null ? (
                        <p className="mt-3 text-xs opacity-60">
                            Couldn&apos;t load live data right now. Try again after the next sync.
                        </p>
                    ) : topScorers.length === 0 ? (
                        <p className="mt-3 text-xs opacity-60">
                            No goals scored yet. Check back after the first match.
                        </p>
                    ) : (
                        <Table
                            rows={topScorers}
                            valueLabel="Goals"
                            value={(s) => s.goals}
                        />
                    )}
                </section>

                <section className="mt-10">
                    <h2 className="font-display text-sm uppercase tracking-[0.25em] text-tournament">
                        Most assists
                    </h2>
                    {topAssists === null ? (
                        <p className="mt-3 text-xs opacity-60">
                            {scorers === null
                                ? "Couldn't load live data right now."
                                : "Assist data isn't available yet — admin will resolve manually if football-data.org doesn't expose it."}
                        </p>
                    ) : topAssists.length === 0 ? (
                        <p className="mt-3 text-xs opacity-60">
                            No assists logged yet.
                        </p>
                    ) : (
                        <Table
                            rows={topAssists}
                            valueLabel="Assists"
                            value={(s) => s.assists ?? 0}
                        />
                    )}
                </section>

                <section className="mt-10">
                    <h2 className="font-display text-sm uppercase tracking-[0.25em] text-tournament">
                        Goals conceded (Sieve)
                    </h2>
                    {conceded.length === 0 ? (
                        <p className="mt-3 text-xs opacity-60">
                            Counts appear after the first finished match.
                        </p>
                    ) : (
                        <table className="mt-3 w-full text-sm tabular">
                            <thead className="border-b border-ink/30 text-left font-display text-[11px] uppercase tracking-wider">
                                <tr>
                                    <th className="py-2 pr-2">#</th>
                                    <th className="py-2 pr-2">Team</th>
                                    <th className="py-2 pr-2 text-right">Played</th>
                                    <th className="py-2 pr-2 text-right">Conceded</th>
                                </tr>
                            </thead>
                            <tbody>
                                {conceded.slice(0, 12).map((r, i) => (
                                    <tr key={r.teamId} className="border-b border-ink/10 last:border-b-0">
                                        <td className="py-2 pr-2 opacity-60">{i + 1}</td>
                                        <td className="py-2 pr-2">
                                            <span className="mr-2" aria-hidden>{flag(r.code)}</span>
                                            {r.name}
                                        </td>
                                        <td className="py-2 pr-2 text-right opacity-70">{r.matchesPlayed}</td>
                                        <td className="py-2 pr-2 text-right font-medium">{r.conceded}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </section>

                <section className="mt-10">
                    <h2 className="font-display text-sm uppercase tracking-[0.25em] text-tournament">
                        Cards (Pantomime Villain)
                    </h2>
                    <p className="mt-3 text-xs opacity-60">
                        football-data.org&apos;s free tier doesn&apos;t expose per-team card counts.
                        Resolved by admin from FIFA&apos;s official disciplinary record at the end
                        of the tournament.
                    </p>
                </section>

                <p className="mt-12 text-[11px] uppercase tracking-wider opacity-50">
                    Source: football-data.org · last sync:{" "}
                    {lastSyncAt !== null
                        ? lastSyncAt.toISOString().replace("T", " ").slice(0, 16) + "Z"
                        : "—"}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-wider opacity-50">
                    Cross-check the Golden Boot:{" "}
                    <a
                        href="https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026"
                        className="underline hover:text-tournament"
                        rel="noreferrer"
                        target="_blank"
                    >
                        FIFA WC2026 official ↗
                    </a>
                </p>
            </main>
        </>
    );
}

function Table({
    rows,
    valueLabel,
    value,
}: {
    rows: FdScorer[];
    valueLabel: string;
    value: (s: FdScorer) => number;
}) {
    return (
        <table className="mt-3 w-full text-sm tabular">
            <thead className="border-b border-ink/30 text-left font-display text-[11px] uppercase tracking-wider">
                <tr>
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Player</th>
                    <th className="py-2 pr-2">Team</th>
                    <th className="py-2 pr-2 text-right">{valueLabel}</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((s, i) => {
                    const canonical = findPlayer(s.player.name);
                    return (
                        <tr key={`${s.team.tla}:${s.player.name}`} className="border-b border-ink/10 last:border-b-0">
                            <td className="py-2 pr-2 opacity-60">{i + 1}</td>
                            <td className="py-2 pr-2">
                                <span className="font-medium">
                                    {canonical?.displayName ?? s.player.name}
                                </span>
                            </td>
                            <td className="py-2 pr-2 opacity-80">
                                {s.team.tla !== null ? (
                                    <>
                                        <span className="mr-1.5" aria-hidden>{flag(s.team.tla)}</span>
                                        <span className="font-display text-xs uppercase opacity-70">
                                            {s.team.tla}
                                        </span>
                                    </>
                                ) : (
                                    <span className="opacity-60">{s.team.name}</span>
                                )}
                            </td>
                            <td className="py-2 pr-2 text-right font-medium">{value(s)}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}
