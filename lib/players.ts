/**
 * Canonical player roster, derived from the official FIFA squad lists PDF.
 *
 * The TOP_SCORER / Golden Boot bonus uses this to:
 *  - drive the typeahead on /bonuses (we never let a friend free-type a name)
 *  - validate `saveBonusAction` payloads server-side
 *  - score picks against admin-resolved winners with diacritic-insensitive matching
 *
 * Source: scripts/parse-squads.ts (re-run when FIFA publishes a new PDF).
 */

import squadData from "@/data/wc2026-players.json";

export interface RosterPlayer {
    shirtNumber: number;
    position: string;
    /** "LAST First" — what we show as the canonical option label. */
    displayName: string;
    firstName: string;
    /** ALL CAPS surname, possibly with diacritics. */
    lastName: string;
    nameOnShirt: string;
    club: string;
    teamCode: string;
    teamName: string;
}

const allPlayers: RosterPlayer[] = squadData.teams.flatMap((t) =>
    t.players.map((p) => ({
        ...p,
        teamCode: t.teamCode,
        teamName: t.teamName,
    })),
);

/**
 * NFD-normalize, drop diacritics, collapse whitespace, lowercase. Used as the
 * cache key for matching free-typed names to canonical rosters when scoring.
 */
export function normalizePlayerName(s: string): string {
    return s
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase();
}

/** Index keyed by normalized displayName — primary lookup for picks. */
const byDisplay = new Map<string, RosterPlayer>();
for (const p of allPlayers) {
    byDisplay.set(normalizePlayerName(p.displayName), p);
}

/**
 * Secondary index: "first last" order so API names like "Kylian Mbappé"
 * resolve against our "MBAPPE Kylian" roster entries.
 */
const byReversed = new Map<string, RosterPlayer>();
for (const p of allPlayers) {
    const parts = p.displayName.split(/\s+/);
    if (parts.length >= 2) {
        const reversed = [...parts.slice(1), parts[0]].join(" ");
        byReversed.set(normalizePlayerName(reversed), p);
    }
}

/** Also index by lastName alone for single-word API names (e.g. "Vinícius Júnior" won't need this, but "Mbappé" would). */
const byLastName = new Map<string, RosterPlayer>();
for (const p of allPlayers) {
    const key = normalizePlayerName(p.lastName);
    if (!byLastName.has(key)) {
        byLastName.set(key, p);
    }
}

/** Returns the canonical roster entry for a free-typed name, or null if unknown. */
export function findPlayer(input: string): RosterPlayer | null {
    const key = normalizePlayerName(input);
    return byDisplay.get(key) ?? byReversed.get(key) ?? byLastName.get(key) ?? null;
}

/** True if any player in the squad data normalizes to this name. */
export function isCanonicalPlayer(input: string): boolean {
    return findPlayer(input) !== null;
}

export function allRosterPlayers(): RosterPlayer[] {
    return allPlayers;
}
