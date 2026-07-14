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
            return "You filed a few and then rode off into the sunset. We kept your seat warm.";
        case "CHAMPION":
            return `Top of the pile on ${d.totalPoints} points. Insufferable, and entitled to be.`;
        case "WOODEN_SPOON":
            return "Dead last of the lot. Someone has to prop up the table, and by God you committed to the role.";
        default:
            return "Here's how your tournament shook out.";
    }
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
                {d.predPoints} off the pitch, {d.bonusPoints} off the bonus board.
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
                    You said {d.bestCall.pick} · it finished {d.bestCall.actual}
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
                    You had {d.worstCall.pick} · it finished {d.worstCall.actual}. Ah here.
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
                    The highest you climbed all tournament. We saw it. It counted.
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
            <p className="max-w-xs text-lg">
                {d.comparableCount > 1
                    ? `More accurate than ${d.moreAccurateThan} of the ${d.comparableCount} who saw it through.`
                    : "You showed up. That's the main thing."}
            </p>
        </Shell>,
    );

    return cards;
}
