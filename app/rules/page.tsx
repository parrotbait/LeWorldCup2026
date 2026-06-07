import Image from "next/image";
import Link from "next/link";
import { NavBar } from "@/app/_components/navbar";
import { getSession } from "@/lib/auth";

export default async function RulesPage() {
    // /rules is the one route that's intentionally readable without logging
    // in (it's linked from the login page). NavBar itself calls
    // requireSession() and would redirect a guest back to / on render — so
    // we branch on getSession() here and show a minimal guest header.
    const session = await getSession();
    return (
        <>
            {session !== null ? (
                <NavBar />
            ) : (
                <header className="border-b border-rule">
                    <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-3">
                        <Link
                            href="/"
                            className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.3em]"
                        >
                            <Image
                                src="/world-cup-logo.png"
                                alt="FIFA World Cup 2026"
                                width={28}
                                height={36}
                                priority
                                className="h-9 w-auto"
                            />
                            <span>
                                <span className="text-tournament">LeWorldCup</span> 2026
                            </span>
                        </Link>
                        <Link
                            href="/"
                            className="ml-auto text-xs text-ink-muted hover:text-tournament"
                        >
                            ← back to login
                        </Link>
                    </div>
                </header>
            )}
            <main className="mx-auto max-w-2xl px-6 py-8 text-[15px] leading-relaxed">
                <h1 className="font-display text-2xl uppercase tracking-widest">Rules</h1>
                <p className="mt-2 text-sm opacity-70">
                    Plain-English version. The canonical source is{" "}
                    <a
                        href="https://github.pie.apple.com/eddie-long/LeWorldCup2026/blob/main/docs/game-design.md"
                        className="underline"
                    >
                        docs/game-design.md
                    </a>
                    .
                </p>

                <section className="mt-8">
                    <h2 className="font-display text-base uppercase tracking-wider">Match predictions</h2>
                    <ul className="mt-2 list-disc space-y-1 pl-6">
                        <li>Pick a scoreline for every match.</li>
                        <li>Group stage: <strong>2 pts</strong> for the right result, <strong>4 pts</strong> for an exact score (not additive — exact replaces).</li>
                        <li>Knockout: <strong>3 pts</strong> for the right result, <strong>6 pts</strong> for an exact score.</li>
                        <li>Predictions lock <strong>15 minutes before kickoff</strong>. After that they&apos;re frozen.</li>
                    </ul>
                </section>

                <section className="mt-8">
                    <h2 className="font-display text-base uppercase tracking-wider">Knockout scoring — extra time &amp; penalties</h2>
                    <p className="mt-2">
                        The score we use for scoring is the <strong>scoreboard at the end of
                        regulation</strong> — that means full-time at 90 minutes, OR the end
                        of extra time if it went to ET. <strong>Penalty shootouts never count
                        for scoring.</strong> A knockout decided on pens is a draw for points
                        purposes — only the AET-inclusive scoreline matters.
                    </p>

                    <h3 className="mt-4 font-display text-xs uppercase tracking-[0.25em] opacity-70">Three cases</h3>
                    <ol className="mt-2 list-decimal space-y-3 pl-6">
                        <li>
                            <strong>Match settled in 90 min (e.g. 2–1 at full time).</strong>{" "}
                            Same as group scoring. Pick the exact score → <strong>6 pts</strong>.
                            Pick the right winner with a different scoreline → <strong>3 pts</strong>.
                            Pick the wrong winner or a draw → 0.
                        </li>
                        <li>
                            <strong>Match decided in extra time (e.g. 1–1 FT, 2–1 after ET).</strong>{" "}
                            We use the <strong>2–1</strong> final. Pick of 2–1 → 6 pts exact.
                            Any other home-win scoreline → 3 pts result. A 1–1 pick earns 0
                            (the FT score is irrelevant).
                        </li>
                        <li>
                            <strong>Match decided on penalties (e.g. 1–1 FT, 1–1 after ET, pens 4–3).</strong>{" "}
                            We use the <strong>1–1</strong> AET-final. Pick of 1–1 → 6 pts exact.
                            Any other draw scoreline (0–0, 2–2, …) → 3 pts result. A
                            home-win or away-win prediction earns <em>0</em> — even if you
                            picked the team that went on to win the shootout.
                        </li>
                    </ol>

                    <p className="mt-4 text-sm opacity-70">
                        The match page shows the full breakdown (FT, AET, pens) so you can see
                        what happened, but the only number used for scoring is the AET-inclusive
                        regulation score.
                    </p>
                </section>

                <section className="mt-8">
                    <h2 className="font-display text-base uppercase tracking-wider">Bonuses</h2>
                    <p className="mt-2 text-sm opacity-70">
                        Two flavours: <strong>Players</strong> (pick a person from the squad list)
                        and <strong>Teams</strong> (pick a country).
                    </p>
                    <h3 className="mt-4 font-display text-xs uppercase tracking-[0.25em] opacity-70">Players</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-6">
                        <li><strong>Golden Boot</strong> (top scorer) — 10 pts</li>
                        <li><strong>Most Assists</strong> — 10 pts</li>
                    </ul>
                    <h3 className="mt-4 font-display text-xs uppercase tracking-[0.25em] opacity-70">Teams</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-6">
                        <li><strong>Tournament winner</strong> — 25 pts</li>
                        <li><strong>Dark horse</strong> (any team not in Pot 1) — 2 / 6 / 12 / 22 / 37 / 57 cumulative as they survive each round</li>
                        <li><strong>Wooden spoon</strong> — 5 pts</li>
                        <li><strong>Pantomime villain</strong> — most yellow + red cards. 5 pts</li>
                        <li><strong>The Sieve</strong> — most goals conceded. 5 pts</li>
                        <li><strong>How the mighty have fallen</strong> — a Pot-1 team that crashes out in the group stage. 8 pts</li>
                    </ul>
                    <p className="mt-3 text-sm opacity-70">All bonuses lock at the tournament&apos;s opening whistle.</p>
                </section>

                <section className="mt-8">
                    <h2 className="font-display text-base uppercase tracking-wider">Ties pay everyone</h2>
                    <p className="mt-2">
                        If two or more players or teams finish level on the metric that decides a
                        bonus (Golden Boot, Most Assists, Wooden Spoon, Sieve, Pantomime Villain,
                        Mighty Fallen, Dark Horse), every player who picked any of the tied
                        options receives the <strong>full points</strong>. We do not split.
                    </p>
                    <p className="mt-2 text-sm opacity-70">
                        Tiebreakers used to decide who&apos;s actually leading: Golden Boot / Most
                        Assists per football-data.org (FIFA wins if it differs at full-time);
                        Sieve = most goals conceded across all matches (penalty-shootout goals
                        don&apos;t count); Pantomime Villain = most yellow + red cards combined,
                        resolved by admin from FIFA&apos;s disciplinary record (the free API
                        doesn&apos;t expose cards, so the live indicator is hidden); Dark Horse =
                        best finish among non-Pot-1 teams; Wooden Spoon = worst finish overall.
                    </p>
                </section>

                <section className="mt-8">
                    <h2 className="font-display text-base uppercase tracking-wider">Visibility</h2>
                    <p className="mt-2">
                        Everyone&apos;s picks for a match become visible <strong>15 minutes before kickoff</strong> — the same moment predictions lock. Bonuses become visible at tournament kickoff. Until then, only you see your picks.
                    </p>
                </section>

                <section className="mt-8">
                    <h2 className="font-display text-base uppercase tracking-wider">Tie-breakers</h2>
                    <ol className="mt-2 list-decimal space-y-1 pl-6">
                        <li>Total points</li>
                        <li>Number of exact-score predictions</li>
                        <li>Bonus points</li>
                        <li>Correct knockout results</li>
                        <li>Earliest signup</li>
                        <li>Coin flip (admin)</li>
                    </ol>
                </section>

                <p className="mt-10 text-sm">
                    <Link href="/leaderboard" className="underline">← back to standings</Link>
                </p>
            </main>
        </>
    );
}
