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

function personaBlurb(d: WrappedData): string {
    switch (d.persona) {
        case "EARLY_RETIREMENT":
            // Kept a wink, not a kicking — disappearing can have real-life reasons.
            return "A handful of picks and then you legged it — the tournament carried on grand without you.";
        case "CHAMPION":
            return `Top on ${d.totalPoints}. Insufferable then, insufferable now. Off you pop and gloat.`;
        case "WOODEN_SPOON":
            return "Dead last. You didn't finish bottom by accident — you earned that, every miserable week of it.";
        case "ORACLE":
            return `${d.exactCount} exact scorelines. Either a savant or you've the match-fixing hotline on speed dial.`;
        case "SNIPER":
            return "Barely turned up with picks, but lethal when you did. Smug about it too, no doubt.";
        case "CONTRARIAN":
            return "You backed the mad option nobody else would touch — and it came in. Insufferable.";
        case "MAVERICK":
            return "Never met a chalk pick you'd lower yourself to. Pure chaos merchant.";
        case "CHANCER":
            return "Threw wild scorelines at the wall all tournament. A couple stuck. Barely.";
        case "BONUS_MERCHANT":
            return "Half your points came off the bonus board. Couldn't pick a match to save your life.";
        case "PROPHET":
            return "You called the winner before a ball was kicked. Lucky guess, we'll assume.";
        case "DARK_HORSE_WHISPERER":
            return "Backed an outsider that actually ran. Don't let it go to your head.";
        case "CLOSER":
            return "Useless in the groups, deadly in the knockouts. A big-game bluffer — but it worked.";
        case "FAST_STARTER":
            return "Flew out of the traps, then faded like a cheap suit. Classic.";
        case "COMEBACK":
            return "Left for dead, then clawed your way back up the table. Nine lives, no shame.";
        case "FRONTRUNNER":
            return "Top of the pile for a while — then the wheels came off in spectacular fashion.";
        case "OPTIMIST":
            return "Every game a goal-fest in your head. Reality had other ideas.";
        case "CAGEY_ONE":
            return "A nil-all merchant to your bones. Thrilling company, we're sure.";
        case "METRONOME":
            return "No fireworks, no disasters, just a steady drip. Beige, but it kept you afloat.";
        case "NEARLY_MAN":
            return "Second or third and never the top. Always the bridesmaid, wha?";
        default:
            return "Grand, middling, forgettable. The human equivalent of a nil-all draw.";
    }
}

/** Tiered accuracy jab for the verdict card — never prints an awkward "0 of N". */
function verdictLine(d: WrappedData): string {
    // Drop-out: don't rub the accuracy stats in.
    if (d.persona === "EARLY_RETIREMENT") {
        return "You barely played, so we'll draw a veil over the accuracy. Probably for the best.";
    }
    const others = d.comparableCount - 1;
    if (others <= 0) {
        return "Sure you were the only one who really played. Hollow, but a win's a win.";
    }
    const beat = d.moreAccurateThan;
    if (beat >= others) {
        return "Sharper than every last one of them. Sickening, really.";
    }
    if (beat === 0) {
        return `You out-read exactly nobody. All ${others} of them called it better. Grim.`;
    }
    if (beat * 2 >= others) {
        return `You read it better than ${beat} of the ${others}. Notions, but earned.`;
    }
    return "Better than a couple, worse than the rest. Mid-table, through and through.";
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
                <p className="text-lg">
                    You called {d.bestCall.actual} on the nose. Broken clock, twice a day, etc.
                </p>
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
                    Your masterstroke: {d.worstCall.pick}. What actually happened: {d.worstCall.actual}.
                    Were you even in the room?
                </p>
            </Shell>,
        );
    }

    // Card 5 — Peak rank.
    if (d.peakRank !== null) {
        cards.push(
            <Shell key="peak">
                <Kicker>Your high-water mark</Kicker>
                <p className="font-display text-7xl tabular">#{d.peakRank}</p>
                <p className="max-w-xs text-base opacity-80">
                    #{d.peakRank}, and that was the ceiling. All downhill from there, all the way to now.
                </p>
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
            <p className="font-display text-6xl tabular">#{d.finalRank}</p>
            <p className="max-w-xs text-lg">{verdictLine(d)}</p>
        </Shell>,
    );

    return cards;
}
