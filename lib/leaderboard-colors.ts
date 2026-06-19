/**
 * Player line colors for the leaderboard chart.
 *
 * Two hand-tuned 11-colour palettes — one for the warm "paper" light bg,
 * one for the dark slate bg. Both are ordered so consecutive slots sit on
 * OPPOSITE sides of the colour wheel (red→blue→yellow→purple→…), guaranteeing
 * that adjacent player IDs always get visibly distinct colours rather than
 * neighbouring hues that read as "the same green-ish thing".
 *
 * Both palettes use the same hue order so a given player keeps their colour
 * identity across modes (slot 3 is yellow/gold in both, just darker on
 * cream and brighter on slate).
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
    "#2563eb", // blue
    "#ca8a04", // gold
    "#6d28d9", // deep purple
    "#65a30d", // lime
    "#c026d3", // magenta
    "#0891b2", // cyan
    "#ea580c", // orange
    "#db2777", // pink
    "#16a34a", // green
    "#92400e", // brown
];

export const LEADERBOARD_COLORS_DARK: readonly string[] = [
    "#f87171", // red
    "#60a5fa", // blue
    "#fcd34d", // gold
    "#a78bfa", // lavender
    "#bef264", // lime
    "#e879f9", // magenta
    "#22d3ee", // cyan
    "#fb923c", // orange
    "#f472b6", // pink
    "#4ade80", // green
    "#d6a16a", // tan
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
