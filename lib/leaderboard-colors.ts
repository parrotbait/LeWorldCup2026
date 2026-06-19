/**
 * Player line colors for the leaderboard chart.
 *
 * Two hand-tuned palettes — one for the warm "paper" light bg, one for the
 * dark slate bg — share the same hue order so a given player keeps their
 * colour identity across modes (e.g. slot 3 is yellow/gold in both, just
 * darker on light and brighter on dark).
 *
 * The active mode is detected at runtime by the chart client via
 * `prefers-color-scheme` (see LeaderboardChartClient). Recharts parses
 * stroke values JS-side for derived effects so we can't use CSS vars here
 * — palettes are committed hex.
 *
 * Assignment is deterministic by `players.id` ascending — see
 * colorForPlayerId. Modulo-wraps once the league exceeds 11.
 */

export const LEADERBOARD_COLORS_LIGHT: readonly string[] = [
    "#c41e1e", // red
    "#1f5fa8", // blue
    "#b8860b", // gold
    "#6b3fa0", // purple
    "#2e7d4f", // green
    "#b03060", // rose
    "#0d8a8a", // aqua
    "#cc5500", // orange
    "#a040b0", // magenta
    "#6b8e23", // lime
    "#5d6770", // slate
];

export const LEADERBOARD_COLORS_DARK: readonly string[] = [
    "#ff5757", // red
    "#60a5fa", // blue
    "#ffd93d", // gold
    "#a78bfa", // purple
    "#4ade80", // green
    "#fb7185", // rose
    "#5eead4", // aqua
    "#ffa53d", // orange
    "#e879f9", // magenta
    "#a8d65d", // lime
    "#94a3b8", // slate
];

export type LeaderboardColorMode = "light" | "dark";

/**
 * Resolve a stable colour for a player given the league's full roster and
 * the current colour-scheme mode. Sorts ids ascending, picks the slot, and
 * returns the matching hex from the light or dark palette.
 */
export function colorForPlayerId(
    playerId: number,
    allPlayerIds: readonly number[],
    mode: LeaderboardColorMode,
): string {
    const palette = mode === "dark" ? LEADERBOARD_COLORS_DARK : LEADERBOARD_COLORS_LIGHT;
    const sorted = [...allPlayerIds].sort((a, b) => a - b);
    const index = sorted.indexOf(playerId);
    if (index === -1) {
        return palette[0]!;
    }
    return palette[index % palette.length]!;
}

/**
 * Backwards-compat default. Callers that don't care about mode (e.g.
 * fallbacks while data is loading) get the light palette. The chart client
 * always passes an explicit mode.
 */
export const LEADERBOARD_COLORS = LEADERBOARD_COLORS_LIGHT;
