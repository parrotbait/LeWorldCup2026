import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db/client";
import { auditLog, bonusPicks, matches, players, teams } from "@/db/schema";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { fetchScorers, type FdScorer } from "@/lib/football-data";
import { fetchTopAssists, type AssistLeader } from "@/lib/espn-stats";
import { findPlayer } from "@/lib/players";
import { flag } from "@/lib/utils";
import { getBonusLockState } from "@/lib/bonus-lock";

interface Picker {
    playerId: number;
    displayName: string;
}

const normalizeName = (s: string): string =>
    s
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase();

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

interface BonusPickerMaps {
    /** Pickers for team-based bonuses, keyed by bonus kind then teamId. */
    byTeam: Map<string, Map<number, Picker[]>>;
    /** Pickers for player-name bonuses, keyed by bonus kind then normalized canonical name. */
    byName: Map<string, Map<string, Picker[]>>;
}

async function loadBonusPickers(): Promise<BonusPickerMaps> {
    const rows = await db
        .select({
            kind: bonusPicks.kind,
            teamId: bonusPicks.teamId,
            playerName: bonusPicks.playerName,
            pickerId: players.id,
            pickerDisplayName: players.displayName,
        })
        .from(bonusPicks)
        .innerJoin(players, eq(bonusPicks.playerId, players.id))
        .where(
            and(
                inArray(bonusPicks.kind, ["SIEVE", "TOP_SCORER", "MOST_ASSISTS"]),
                eq(bonusPicks.groupLetter, ""),
            ),
        );

    const byTeam = new Map<string, Map<number, Picker[]>>();
    const byName = new Map<string, Map<string, Picker[]>>();
    for (const r of rows) {
        const picker: Picker = { playerId: r.pickerId, displayName: r.pickerDisplayName };
        if (r.teamId !== null) {
            let kindMap = byTeam.get(r.kind);
            if (kindMap === undefined) {
                kindMap = new Map();
                byTeam.set(r.kind, kindMap);
            }
            const list = kindMap.get(r.teamId) ?? [];
            list.push(picker);
            kindMap.set(r.teamId, list);
        } else if (r.playerName !== null) {
            // Canonicalize against the roster so "Vini Jr" and "Vinícius Júnior"
            // bucket the same way as the table row's display name.
            const canonical = findPlayer(r.playerName);
            const key = normalizeName(canonical?.displayName ?? r.playerName);
            let kindMap = byName.get(r.kind);
            if (kindMap === undefined) {
                kindMap = new Map();
                byName.set(r.kind, kindMap);
            }
            const list = kindMap.get(key) ?? [];
            list.push(picker);
            kindMap.set(key, list);
        }
    }
    const sortPickers = (list: Picker[]): Picker[] =>
        [...list].sort((a, b) => a.displayName.localeCompare(b.displayName));
    for (const kindMap of byTeam.values()) {
        for (const [k, list] of kindMap) {
            kindMap.set(k, sortPickers(list));
        }
    }
    for (const kindMap of byName.values()) {
        for (const [k, list] of kindMap) {
            kindMap.set(k, sortPickers(list));
        }
    }
    return { byTeam, byName };
}

export default async function StatsPage() {
    await requireSession();

    const [scorers, conceded, lastSync, lockState, assistLeaders] = await Promise.all([
        fetchScorersOrNull(),
        loadConceded(),
        db
            .select({ at: auditLog.at })
            .from(auditLog)
            .where(eq(auditLog.action, "sync-results"))
            .orderBy(desc(auditLog.id))
            .limit(1),
        getBonusLockState(),
        fetchTopAssists(),
    ]);

    // Picks reveal at the bonus deadline — same boundary edits use — so
    // late-fillers can't peek and copy during the grace window.
    const showPickers = lockState.locked;
    const pickers: BonusPickerMaps = showPickers
        ? await loadBonusPickers()
        : { byTeam: new Map(), byName: new Map() };
    const pickersForTeam = (kind: string, teamId: number): Picker[] =>
        showPickers ? (pickers.byTeam.get(kind)?.get(teamId) ?? []) : [];
    const pickersForName = (kind: string, name: string): Picker[] =>
        showPickers ? (pickers.byName.get(kind)?.get(normalizeName(name)) ?? []) : [];

    // Cap each table at 10 rows. If rows beyond the cap share the same metric
    // as row 10, surface the count in a "+N more on X goals" footer instead
    // of dumping every tied player into the table — keeps the page scannable
    // when the long tail is people on 1 goal / 1 conceded each.
    const ROW_CAP = 10;

    interface TieFooter {
        count: number;
        cutoff: number;
    }
    function tieFooter<T>(items: T[], metric: (t: T) => number): TieFooter | null {
        if (items.length <= ROW_CAP) {
            return null;
        }
        const cutoff = metric(items[ROW_CAP - 1]!);
        let count = 0;
        for (let i = ROW_CAP; i < items.length; i += 1) {
            if (metric(items[i]!) === cutoff) {
                count += 1;
            }
        }
        if (count === 0) {
            return null;
        }
        return { count, cutoff };
    }

    const sortedScorers = scorers === null
        ? null
        : [...scorers]
              .filter((s) => s.goals > 0)
              .sort((a, b) => b.goals - a.goals || (b.assists ?? 0) - (a.assists ?? 0));
    const topScorers = sortedScorers?.slice(0, ROW_CAP) ?? null;
    const scorersTie =
        sortedScorers !== null ? tieFooter(sortedScorers, (s) => s.goals) : null;

    const assistsAvailable = assistLeaders !== null && assistLeaders.length > 0;
    const fallbackAssists = !assistsAvailable && scorers !== null && scorers.some((s) => s.assists !== null && s.assists > 0);
    const sortedAssists = fallbackAssists
        ? [...scorers!]
              .filter((s) => (s.assists ?? 0) > 0)
              .sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0) || b.goals - a.goals)
        : null;
    const topAssistsFallback = sortedAssists?.slice(0, ROW_CAP) ?? null;
    const assistsTie = sortedAssists !== null
        ? tieFooter(sortedAssists, (s) => s.assists ?? 0)
        : null;

    const concededTop = conceded.slice(0, ROW_CAP);
    const concededTie = tieFooter(conceded, (r) => r.conceded);

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
                            tieFooterText={
                                scorersTie !== null
                                    ? `+${scorersTie.count} more on ${scorersTie.cutoff} goal${scorersTie.cutoff === 1 ? "" : "s"}`
                                    : null
                            }
                            pickersFor={(s) => {
                                const canonical = findPlayer(s.player.name);
                                return pickersForName(
                                    "TOP_SCORER",
                                    canonical?.displayName ?? s.player.name,
                                );
                            }}
                        />
                    )}
                </section>

                <section className="mt-10">
                    <h2 className="font-display text-sm uppercase tracking-[0.25em] text-tournament">
                        Most assists
                    </h2>
                    {assistsAvailable ? (
                        <AssistTable
                            rows={assistLeaders!.slice(0, ROW_CAP)}
                            pickersForName={(name) => pickersForName("MOST_ASSISTS", name)}
                        />
                    ) : topAssistsFallback !== null ? (
                        <>
                            <p className="mt-2 text-[10px] uppercase tracking-wider opacity-40">
                                Showing assists from goal-scorers only — full data unavailable
                            </p>
                            <Table
                                rows={topAssistsFallback}
                                valueLabel="Assists"
                                value={(s) => s.assists ?? 0}
                                tieFooterText={
                                    assistsTie !== null
                                        ? `+${assistsTie.count} more on ${assistsTie.cutoff} assist${assistsTie.cutoff === 1 ? "" : "s"}`
                                        : null
                                }
                                pickersFor={(s) => {
                                    const canonical = findPlayer(s.player.name);
                                    return pickersForName(
                                        "MOST_ASSISTS",
                                        canonical?.displayName ?? s.player.name,
                                    );
                                }}
                            />
                        </>
                    ) : (
                        <p className="mt-3 text-xs opacity-60">
                            {scorers === null
                                ? "Couldn’t load live data right now."
                                : "Assist data isn’t available yet."}
                        </p>
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
                                {concededTop.map((r, i) => {
                                    const rowPickers = pickersForTeam("SIEVE", r.teamId);
                                    return (
                                        <tr key={r.teamId} className="border-b border-ink/10 last:border-b-0">
                                            <td className="py-2 pr-2 align-top opacity-60">{i + 1}</td>
                                            <td className="py-2 pr-2 align-top">
                                                <div>
                                                    <span className="mr-2" aria-hidden>{flag(r.code)}</span>
                                                    {r.name}
                                                </div>
                                                <PickersLine pickers={rowPickers} />
                                            </td>
                                            <td className="py-2 pr-2 text-right align-top opacity-70">{r.matchesPlayed}</td>
                                            <td className="py-2 pr-2 text-right align-top font-medium">{r.conceded}</td>
                                        </tr>
                                    );
                                })}
                                {concededTie !== null ? (
                                    <tr>
                                        <td
                                            colSpan={4}
                                            className="py-2 pr-2 text-center font-display text-[11px] uppercase tracking-wider opacity-50"
                                        >
                                            +{concededTie.count} more on {concededTie.cutoff} conceded
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    )}
                </section>

                <section className="mt-10">
                    <h2 className="font-display text-sm uppercase tracking-[0.25em] text-tournament">
                        Cards (Pantomime Villain)
                    </h2>
                    <p className="mt-3 text-xs opacity-60">
                        Cross-check ESPN&rsquo;s{" "}
                        <a
                            href="https://www.espn.co.uk/football/stats/_/league/FIFA.WORLD/view/discipline"
                            className="underline hover:text-tournament"
                            rel="noreferrer"
                            target="_blank"
                        >
                            discipline table ↗
                        </a>
                        . Admin will resolve this bonus manually — the ESPN page sits behind a bot
                        challenge that blocks server-side scraping.
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
    pickersFor,
    tieFooterText,
}: {
    rows: FdScorer[];
    valueLabel: string;
    value: (s: FdScorer) => number;
    pickersFor?: (s: FdScorer) => Picker[];
    tieFooterText?: string | null;
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
                    const rowPickers = pickersFor?.(s) ?? [];
                    return (
                        <tr key={`${s.team.tla}:${s.player.name}`} className="border-b border-ink/10 last:border-b-0">
                            <td className="py-2 pr-2 align-top opacity-60">{i + 1}</td>
                            <td className="py-2 pr-2 align-top">
                                <div className="font-medium">
                                    {canonical?.displayName ?? s.player.name}
                                </div>
                                <PickersLine pickers={rowPickers} />
                            </td>
                            <td className="py-2 pr-2 align-top opacity-80">
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
                            <td className="py-2 pr-2 text-right align-top font-medium">{value(s)}</td>
                        </tr>
                    );
                })}
                {tieFooterText !== null && tieFooterText !== undefined ? (
                    <tr>
                        <td
                            colSpan={4}
                            className="py-2 pr-2 text-center font-display text-[11px] uppercase tracking-wider opacity-50"
                        >
                            {tieFooterText}
                        </td>
                    </tr>
                ) : null}
            </tbody>
        </table>
    );
}

function PickersLine({ pickers }: { pickers: Picker[] }) {
    if (pickers.length === 0) {
        return null;
    }
    return (
        <div className="mt-0.5 text-[11px] opacity-70">
            <span className="font-display uppercase tracking-wider opacity-60">
                Picked by
            </span>{" "}
            {pickers.map((p, i) => (
                <span key={p.playerId}>
                    {i > 0 ? <span className="opacity-50">, </span> : null}
                    <Link
                        href={`/players/${p.playerId}` as never}
                        className="hover:text-tournament hover:underline"
                    >
                        {p.displayName}
                    </Link>
                </span>
            ))}
        </div>
    );
}

function AssistTable({
    rows,
    pickersForName,
}: {
    rows: AssistLeader[];
    pickersForName: (name: string) => Picker[];
}) {
    return (
        <table className="mt-3 w-full text-sm tabular">
            <thead className="border-b border-ink/30 text-left font-display text-[11px] uppercase tracking-wider">
                <tr>
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Player</th>
                    <th className="py-2 pr-2">Team</th>
                    <th className="py-2 pr-2 text-right">Assists</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((r, i) => {
                    const canonical = findPlayer(r.playerName);
                    const displayName = canonical?.displayName ?? r.playerName;
                    const pickers = pickersForName(displayName);
                    return (
                        <tr key={`${r.teamCode}:${r.playerName}`} className="border-b border-ink/10 last:border-b-0">
                            <td className="py-2 pr-2 align-top opacity-60">{i + 1}</td>
                            <td className="py-2 pr-2 align-top">
                                <div className="font-medium">{displayName}</div>
                                <PickersLine pickers={pickers} />
                            </td>
                            <td className="py-2 pr-2 align-top opacity-80">
                                <span className="mr-1.5" aria-hidden>{flag(r.teamCode)}</span>
                                <span className="font-display text-xs uppercase opacity-70">{r.teamCode}</span>
                            </td>
                            <td className="py-2 pr-2 text-right align-top font-medium">{r.assists}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}
