/**
 * Player line colors for the leaderboard chart.
 *
 * Two hand-tuned 11-colour palettes — one for the warm "paper" light bg,
 * one for the dark slate bg. Every pair in a palette is chosen to be
 * unambiguously distinguishable: no two hues that read as "the same red" or
 * "the same blue" coexist. Specifically dropped: pink (collides with red),
 * cyan (collides with blue), lime (collides with green).
 *
 * That gives us 8 saturated hues plus 3 distinct neutrals (tan, near-white,
 * gray), filling 11 slots without confusable pairs.
 *
 * Both palettes use the same hue order so a given player keeps their colour
 * identity across modes (slot 3 is yellow/gold in both).
 *
 * Recharts parses stroke values JS-side for derived effects, so we commit
 * real hex here rather than CSS vars (which it can't evaluate). The active
 * mode is detected at runtime by the chart client via prefers-color-scheme.
 *
 * Assignment is deterministic by `players.id` ascending — see
 * colorForPlayerId. Modulo-wraps once the league exceeds 11.
 */

export const LEADERBOARD_COLORS_LIGHT: readonly string[] = [
    "#dc2626", // red
    "#ea580c", // orange
    "#ca8a04", // yellow/gold
    "#16a34a", // green
    "#0d9488", // teal
    "#2563eb", // blue
    "#6d28d9", // deep purple
    "#c026d3", // magenta
    "#92400e", // brown
    "#525252", // dark gray
    "#18181b", // near-black
];

export const LEADERBOARD_COLORS_DARK: readonly string[] = [
    "#f87171", // red
    "#fb923c", // orange
    "#fcd34d", // gold
    "#4ade80", // green
    "#14b8a6", // teal
    "#60a5fa", // blue
    "#a78bfa", // lavender
    "#e879f9", // magenta
    "#d6a16a", // tan
    "#f5f5f4", // near-white
    "#71717a", // medium gray
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
