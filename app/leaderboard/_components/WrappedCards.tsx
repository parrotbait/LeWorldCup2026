"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import type { WrappedData } from "@/lib/wrapped";

const PERSONA_TITLE: Record<string, string> = {
    EARLY_RETIREMENT: "The Early Retirement",
    CHAMPION: "The Champion",
    WOODEN_SPOON: "The Wooden Spoon",
    STEADY_EDDIE: "Steady Eddie",
    ORACLE: "The Oracle",
    SNIPER: "The Sniper",
    CONTRARIAN: "The Contrarian",
    MAVERICK: "The Maverick",
    CHANCER: "The Chancer",
    BONUS_MERCHANT: "The Bonus Merchant",
    PROPHET: "The Prophet",
    DARK_HORSE_WHISPERER: "The Dark Horse Whisperer",
    CLOSER: "The Closer",
    FAST_STARTER: "The Fast Starter",
    COMEBACK: "The Comeback",
    FRONTRUNNER: "The Frontrunner",
    OPTIMIST: "The Optimist",
    CAGEY_ONE: "The Cagey One",
    METRONOME: "The Metronome",
    NEARLY_MAN: "The Nearly Man",
};

function Shell({ children }: { children: ReactNode }) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-center">
            {children}
        </div>
    );
}

function Kicker({ children }: { children: ReactNode }) {
    return (
        <p className="font-display text-xs uppercase tracking-[0.3em] text-tournament">{children}</p>
    );
}

/**
 * Deterministic variant picker. Same player + same card key always yields the
 * same line, but different players see different variants — so the group as a
 * whole gets variety without any single player's story shifting between views.
 */
function pick<T>(playerId: number, key: string, variants: readonly T[]): T {
    let h = 2166136261;
    const s = `${playerId}:${key}`;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % variants.length;
    return variants[idx];
}

/** "1st", "2nd", "3rd", "4th" — with the correct English exceptions for 11–13. */
function ordinal(n: number): string {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) {
        return `${n}th`;
    }
    const mod10 = n % 10;
    if (mod10 === 1) {
        return `${n}st`;
    }
    if (mod10 === 2) {
        return `${n}nd`;
    }
    if (mod10 === 3) {
        return `${n}rd`;
    }
    return `${n}th`;
}

function personaBlurb(d: WrappedData): string {
    switch (d.persona) {
        case "EARLY_RETIREMENT":
            // Kept a wink, not a kicking — disappearing can have real-life reasons.
            return pick(d.playerId, "persona:EARLY_RETIREMENT", [
                "A handful of picks and then quiet. The tournament managed without you.",
                "Signed up, showed face, disappeared. No harm done.",
                "Cameo appearance and out. Life gets in the way.",
            ]);
        case "CHAMPION":
            return pick(d.playerId, "persona:CHAMPION", [
                `Top on ${d.totalPoints}. Well done. Don't wear it out.`,
                `${d.totalPoints} points and the trophy's yours. Enjoy it — quietly, ideally.`,
                `First on ${d.totalPoints}. A fine effort. Nobody's going to say it twice.`,
            ]);
        case "WOODEN_SPOON":
            return pick(d.playerId, "persona:WOODEN_SPOON", [
                "Dead last (except Dan). Not an accident — that took commitment.",
                "Rock bottom of the players still turning up. Consistent, at least.",
                "The spoon's yours. You'll have plenty of time with it.",
            ]);
        case "ORACLE":
            return pick(d.playerId, "persona:ORACLE", [
                `${d.exactCount} exact scorelines. Suspicious, really.`,
                `${d.exactCount} on the nose. Beginner's luck, presumably.`,
                `${d.exactCount} exact calls. We'll not ask how.`,
            ]);
        case "SNIPER":
            return pick(d.playerId, "persona:SNIPER", [
                "Barely turned up, but the picks landed. Not the worst approach.",
                "Few and far between, and every one of them counted. Fair enough.",
                "Half the picks, twice the accuracy. Draw your own conclusions.",
            ]);
        case "CONTRARIAN":
            return pick(d.playerId, "persona:CONTRARIAN", [
                "You backed the option nobody fancied and it came in. Fair play.",
                "Went against the room and got paid. Won't happen twice.",
                "Picked the one nobody would touch. Turned out fine.",
            ]);
        case "MAVERICK":
            return pick(d.playerId, "persona:MAVERICK", [
                "Never met a chalk pick you'd stoop to. A choice, that.",
                "Anti-consensus to the bone. Whether it worked is another question.",
                "You'd rather be wrong your own way than right anyone else's. Noted.",
            ]);
        case "CHANCER":
            return pick(d.playerId, "persona:CHANCER", [
                "Threw wild scorelines at the wall. The odd one stuck.",
                "All hope, no homework. Occasionally rewarded.",
                "Every pick a lottery ticket. Now and then the numbers came in.",
            ]);
        case "BONUS_MERCHANT":
            return pick(d.playerId, "persona:BONUS_MERCHANT", [
                "Half your points came off the bonus board. The picks didn't help much.",
                "The bonuses did the lifting. The matches, less so.",
                "Take the bonus board away and you'd be nowhere. Points are points.",
            ]);
        case "PROPHET":
            return pick(d.playerId, "persona:PROPHET", [
                "Called the winner before a ball was kicked. Educated guess, we'll say.",
                "Named the champions on day one. Handy, that.",
                "Had the winner in the bag from the off. Not bad.",
            ]);
        case "DARK_HORSE_WHISPERER":
            return pick(d.playerId, "persona:DARK_HORSE_WHISPERER", [
                "Backed an outsider that actually ran. Take the win.",
                "Spotted the bolter early. Won't necessarily do it twice.",
                "The dark horse came in and you'd money on it. Enjoy it.",
            ]);
        case "CLOSER":
            return pick(d.playerId, "persona:CLOSER", [
                "Quiet in the groups, sharp in the knockouts. Timing counts.",
                "Woke up when it mattered. The group stage was optional, evidently.",
                "Nothing during the groups, everything from R32 on. Different animal.",
            ]);
        case "FAST_STARTER":
            return pick(d.playerId, "persona:FAST_STARTER", [
                "Out of the traps quick, and faded quicker.",
                "First week hero, last week ghost. Ran out of road.",
                "Cracking start, thin finish. Bit of a pattern.",
            ]);
        case "COMEBACK":
            return pick(d.playerId, "persona:COMEBACK", [
                "Left for dead, then quietly climbed back up. Fair play.",
                "Written off, then back in the mix. Didn't say much about it either.",
                "Down and out for weeks, then up the table. Neatly done.",
            ]);
        case "FRONTRUNNER":
            return pick(d.playerId, "persona:FRONTRUNNER", [
                "Top of the pile for a while — and then not.",
                "Led early, quietly slid down. The old story.",
                "Peaked too soon. Paid for it. We saw.",
            ]);
        case "OPTIMIST":
            return pick(d.playerId, "persona:OPTIMIST", [
                "Every game a goal-fest in your head. The pitch disagreed.",
                "3-2s and 4-3s for weeks. The matches went another way.",
                "Predicted more goals than the tournament produced. Enthusiasm noted.",
            ]);
        case "CAGEY_ONE":
            return pick(d.playerId, "persona:CAGEY_ONE", [
                "Nil-alls to your bones. Cautious to a fault.",
                "1-0s and nil-nils for weeks. Not wrong, exactly.",
                "You'd back a defensive slog before a party. Each to their own.",
            ]);
        case "METRONOME":
            return pick(d.playerId, "persona:METRONOME", [
                "No fireworks, no disasters. Kept you in the mix.",
                "Same points, week after week. Reliable, if nothing else.",
                "Never spiked, never crashed. Grand, throughout.",
            ]);
        case "NEARLY_MAN":
            return pick(d.playerId, "persona:NEARLY_MAN", [
                "Second or third, never the top. So it goes.",
                "Close enough to see it, not close enough to touch it.",
                "Podium finish and no further. That'll sting for a while.",
            ]);
        default:
            return pick(d.playerId, "persona:DEFAULT", [
                "Middling, forgettable. A nil-all draw in human form.",
                "Neither hero nor villain. Somewhere in the middle, all the way through.",
                "You were there. That's about it.",
            ]);
    }
}

/**
 * Tiered accuracy jab for the verdict card. `moreAccurateThan` /
 * `comparableCount` compare *reading* (share of settled picks called
 * correctly), NOT the points table — a mid-table finisher can still out-read
 * most of the room, so the copy has to say "on the calls" explicitly. "Behind
 * you" wording is banned here; it reads as league position.
 */
function verdictLine(d: WrappedData): string {
    // Drop-out: don't rub the accuracy stats in.
    if (d.persona === "EARLY_RETIREMENT") {
        return pick(d.playerId, "verdict:dropout", [
            "Not enough picks to judge fairly. We'll leave it there.",
            "Too little data for a verdict. Probably for the best.",
            "We'll skip the accuracy — there wasn't much to work with.",
        ]);
    }
    const others = d.comparableCount - 1;
    if (others <= 0) {
        return pick(d.playerId, "verdict:solo", [
            "Sure you were the only one who saw it through. Take the win.",
            "Last one standing, so top by default. Yours all the same.",
            "Nobody else really played. That'll do.",
        ]);
    }
    const beat = d.moreAccurateThan;
    if (beat >= others) {
        return pick(d.playerId, "verdict:top", [
            "Read the games sharper than the lot of them. Fair play.",
            "Nobody called more games right than you. Take a bow. A short one.",
            "Top of the accuracy pile too. Two boxes ticked, then.",
        ]);
    }
    if (beat === 0) {
        return pick(d.playerId, "verdict:bottom", [
            `Out-read exactly nobody on accuracy. All ${others} called more games right.`,
            `${others} of them read the games better than you. Every single one.`,
            `Bottom on accuracy — every one of the ${others} called more games right. Something to work on.`,
        ]);
    }
    if (beat * 2 >= others) {
        return pick(d.playerId, "verdict:upper", [
            "Read more games right than most. Respectable enough.",
            `Called more games right than ${beat} of the ${others} others. Solid, without being flash.`,
            `Above the median for accuracy — out-read ${beat} of ${others} on the calls. That'll do.`,
        ]);
    }
    return pick(d.playerId, "verdict:lower", [
        "Read a couple better, most read it better than you. Middling, on the calls.",
        `Called more games right than ${beat} of ${others}. The rest had your number.`,
        `Out-read ${beat} of ${others} on accuracy. More ahead than behind.`,
    ]);
}

/**
 * Compact rank-over-time sparkline for the peak card. Rank axis is inverted
 * (rank 1 sits at the top). Peak is marked with a hollow dot; the finish rank
 * is marked with a filled dot so the "peak vs. now" story is visible at a
 * glance. Draws from the frozen `rankHistory` on WrappedData — no fetching.
 */
function RankSparkline({
    history,
    finalRank,
}: {
    history: { t: number; rank: number }[];
    finalRank: number;
}) {
    const width = 260;
    const height = 60;
    const padX = 6;
    const padY = 6;
    const minRank = Math.min(...history.map((h) => h.rank), finalRank, 1);
    const maxRank = Math.max(...history.map((h) => h.rank), finalRank);
    const rankSpan = Math.max(1, maxRank - minRank);
    const tMin = history[0]!.t;
    const tMax = history[history.length - 1]!.t;
    const tSpan = Math.max(1, tMax - tMin);
    const x = (t: number): number => padX + ((t - tMin) / tSpan) * (width - padX * 2);
    // Invert: lower rank number = higher on the chart.
    const y = (rank: number): number =>
        padY + ((rank - minRank) / rankSpan) * (height - padY * 2);

    const points = history.map((h) => `${x(h.t).toFixed(1)},${y(h.rank).toFixed(1)}`).join(" ");
    const peakEntry = history.reduce((best, h) => (h.rank < best.rank ? h : best));
    const lastEntry = history[history.length - 1]!;

    return (
        <svg
            role="img"
            aria-label={`Rank over the tournament: peaked at #${peakEntry.rank}, finished at #${lastEntry.rank}`}
            viewBox={`0 0 ${width} ${height}`}
            className="mt-1 h-16 w-full max-w-xs"
        >
            <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-tournament/80"
                points={points}
            />
            {/* Peak — hollow dot at the top of the run */}
            <circle
                cx={x(peakEntry.t)}
                cy={y(peakEntry.rank)}
                r={3.5}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-tournament"
            />
            {/* Finish — filled dot at the end */}
            <circle
                cx={x(lastEntry.t)}
                cy={y(lastEntry.rank)}
                r={3}
                fill="currentColor"
                className="text-ink"
            />
        </svg>
    );
}

function peakBlurb(d: WrappedData, peak: number): string {
    // Still at the ceiling — the old "all downhill" line is a lie.
    if (peak === d.finalRank) {
        if (peak === 1) {
            return pick(d.playerId, "peak:heldFirst", [
                "Top of the tree, and never off it. Well held.",
                "#1 at the peak, #1 at the death. Nobody laid a glove on you.",
                "Hit the top and stayed there. Job done.",
            ]);
        }
        return pick(d.playerId, "peak:heldOther", [
            `Climbed to #${peak} and stayed there. Steady as she goes.`,
            `Reached #${peak} and held it. No fireworks, no collapse.`,
            `#${peak} at the peak, #${peak} at the whistle. Nothing lost, nothing gained.`,
        ]);
    }
    return pick(d.playerId, "peak:fell", [
        `#${peak} was the ceiling. Downhill from there.`,
        `Peaked at #${peak}. A slow slide ever since.`,
        `#${peak} was as good as it got. Gravity did the rest.`,
    ]);
}

function bestCallLine(playerId: number, actual: string): string {
    return pick(playerId, "best:line", [
        `You called ${actual} on the nose. Broken clock, twice a day, etc.`,
        `${actual} on the nose. A stopped clock has its moments.`,
        `Called ${actual} exactly. Write it down, it won't happen twice.`,
        `Nailed ${actual} to the wall. Not a habit, we'll take it.`,
        `${actual}, spot on. File it under one-offs.`,
    ]);
}

function worstCallLine(playerId: number, pick_: string, actual: string): string {
    return pick(playerId, "worst:line", [
        `Your masterstroke: ${pick_}. What actually happened: ${actual}. Miles off — not even the same postcode.`,
        `You went ${pick_}. The world went ${actual}. Different sport, near enough.`,
        `Called ${pick_}. Got ${actual}. A read of considerable ambition.`,
        `${pick_} was the bet. ${actual} was the result. Not much overlap there.`,
        `Filed ${pick_}. Reality filed ${actual}. Two different games entirely.`,
    ]);
}

/**
 * Build the ordered list of cards for a player. Cards that don't apply (no
 * best/worst call, no bonuses, no snapshots) are omitted so a low-data player
 * still gets a clean, complete story. See spec §4.
 */
export function buildCards(d: WrappedData): ReactNode[] {
    const cards: ReactNode[] = [];

    // Card 1 — Persona.
    cards.push(
        <Shell key="persona">
            <Kicker>Your 2026 persona</Kicker>
            <h2 className="font-display text-4xl uppercase tracking-wide">
                {PERSONA_TITLE[d.persona]}
            </h2>
            <p className="max-w-xs text-lg">{personaBlurb(d)}</p>
        </Shell>,
    );

    // Card 2 — The Damage.
    cards.push(
        <Shell key="damage">
            <Kicker>The damage</Kicker>
            <p className="font-display text-7xl tabular">{d.totalPoints}</p>
            <p className="text-sm uppercase tracking-widest opacity-70">points</p>
            <p className="max-w-xs text-base opacity-80">
                {d.predPoints} earned on the pitch, {d.bonusPoints} off the bonus board. We won&apos;t
                ask how many were flukes.
            </p>
        </Shell>,
    );

    // Card 3 — Best call.
    if (d.bestCall !== null) {
        cards.push(
            <Shell key="best">
                <Kicker>Your best call</Kicker>
                <p className="font-display text-2xl">{d.bestCall.matchLabel}</p>
                <p className="text-lg">{bestCallLine(d.playerId, d.bestCall.actual)}</p>
                {d.bestCall.points !== undefined ? (
                    <p className="font-display text-4xl text-pitch tabular">+{d.bestCall.points}</p>
                ) : null}
            </Shell>,
        );
    }

    // Card 4 — Worst call (present only when filed >= 3).
    if (d.worstCall !== null) {
        cards.push(
            <Shell key="worst">
                <Kicker>Your worst call</Kicker>
                <p className="font-display text-2xl">{d.worstCall.matchLabel}</p>
                <p className="text-lg">
                    {worstCallLine(d.playerId, d.worstCall.pick, d.worstCall.actual)}
                </p>
            </Shell>,
        );
    }

    // Card 5 — Peak rank + rank-over-time sparkline.
    if (d.peakRank !== null) {
        cards.push(
            <Shell key="peak">
                <Kicker>Your high-water mark</Kicker>
                <p className="font-display text-7xl tabular">#{d.peakRank}</p>
                <p className="text-xs uppercase tracking-widest opacity-70">
                    peaked · finished #{d.finalRank}
                </p>
                {d.rankHistory !== undefined && d.rankHistory.length >= 2 ? (
                    <RankSparkline history={d.rankHistory} finalRank={d.finalRank} />
                ) : null}
                <p className="max-w-xs text-base opacity-80">{peakBlurb(d, d.peakRank)}</p>
            </Shell>,
        );
    }

    // Card 6 — Bonus board.
    if (d.bonusHits.length > 0) {
        cards.push(
            <Shell key="bonus">
                <Kicker>The bonus board</Kicker>
                <ul className="space-y-1 text-base">
                    {d.bonusHits.map((b, i) => (
                        <li key={i}>
                            {b.label}: {b.pick} <span className="text-pitch">+{b.points}</span>
                        </li>
                    ))}
                </ul>
            </Shell>,
        );
    }

    // Card 7 — If you were a footballer (always).
    cards.push(
        <Shell key="footballer">
            <Kicker>If you were a footballer…</Kicker>
            <Image
                src={d.footballer.sticker}
                alt={d.footballer.name}
                width={260}
                height={390}
                className="max-h-[52vh] max-w-full rounded-lg object-contain shadow-xl"
            />
            <p className="font-display text-2xl uppercase">{d.footballer.name}</p>
            <p className="max-w-xs text-base opacity-80">{d.footballer.tie}</p>
        </Shell>,
    );

    // Card 8 — The Verdict (always).
    cards.push(
        <Shell key="verdict">
            <Kicker>The verdict</Kicker>
            <p className="font-display text-5xl">{ordinal(d.finalRank)} position</p>
            <p className="text-xs uppercase tracking-widest opacity-70">on points</p>
            <p className="max-w-xs text-lg">{verdictLine(d)}</p>
        </Shell>,
    );

    return cards;
}
