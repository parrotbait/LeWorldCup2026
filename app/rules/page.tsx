import Link from "next/link";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";

export default async function RulesPage() {
    await requireSession().catch(() => undefined);
    return (
        <>
            <NavBar />
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
                    <h2 className="font-display text-base uppercase tracking-wider">Extra time &amp; penalties</h2>
                    <ul className="mt-2 list-disc space-y-1 pl-6">
                        <li>If a knockout match goes to extra time, scoring uses the <strong>final score after extra time</strong> (not the 90-minute score). A 1–1 prediction earns <em>nothing</em> if the final-after-AET was 2–2; the 2–2 prediction wins the exact bonus.</li>
                        <li>Penalty shootouts <strong>do not count</strong> for prediction points. A knockout decided on penalties is treated as a draw for scoring — only the AET-final score matters.</li>
                        <li>Example: regulation 1–1, AET 1–1, pens 4–3 to home. Picks of <strong>1–1</strong> earn the exact bonus; any other draw scoreline earns the result bonus; home-win or away-win picks earn 0.</li>
                        <li>The match page shows the full breakdown (FT, AET, pens) for transparency, but the canonical "score" used for points is always the AET-inclusive scoreboard at the end of regulation.</li>
                    </ul>
                </section>

                <section className="mt-8">
                    <h2 className="font-display text-base uppercase tracking-wider">Bonuses</h2>
                    <ul className="mt-2 list-disc space-y-1 pl-6">
                        <li><strong>Tournament winner</strong> — 25 pts</li>
                        <li><strong>Top scorer (Golden Boot)</strong> — 10 pts (shared boot? everyone who picked any joint winner gets 10)</li>
                        <li><strong>Dark horse</strong> (any team not in Pot 1) — 2 / 6 / 12 / 22 / 37 / 57 cumulative as they survive each round</li>
                        <li><strong>Wooden spoon</strong> (worst team in worst group) — 5 pts</li>
                    </ul>
                    <p className="mt-2 text-sm opacity-70">All bonuses lock at tournament kickoff.</p>
                </section>

                <section className="mt-8">
                    <h2 className="font-display text-base uppercase tracking-wider">Hall of Shame (anti-bonuses)</h2>
                    <p className="mt-2 text-sm opacity-70">Reward picks that nail who&apos;s going to be rubbish.</p>
                    <ul className="mt-2 list-disc space-y-1 pl-6">
                        <li><strong>Pantomime villain</strong> — most yellow + red cards across the tournament. 5 pts</li>
                        <li><strong>The Sieve</strong> — most goals conceded. 5 pts</li>
                        <li><strong>How the mighty have fallen</strong> — a Pot-1 team that crashes out in the group stage. 8 pts</li>
                    </ul>
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
