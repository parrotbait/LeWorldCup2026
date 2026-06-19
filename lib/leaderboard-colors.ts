/**
 * Player line colors for the leaderboard chart.
 *
 * Hand-picked palette tuned for the warm `paper` background. Each colour is
 * sufficiently distinct from its neighbours that 11 lines on one chart stay
 * tellable apart. The two anchors (tournament red and mustard) match the
 * existing brand tokens; the remaining nine span teal, blue, purple, orange,
 * green, pink, slate, olive and cyan to maximise hue separation.
 *
 * Assignment is deterministic by `players.id` ascending — see
 * colorForPlayerId. The current league is fixed at 11 players, so the modulo
 * in colorForPlayerId is purely future-proofing; if a 12th player is ever
 * added, palette wraps and we'd revisit the colours then.
 */
export const LEADERBOARD_COLORS: readonly string[] = [
    "#e61d25", // tournament red (anchor)
    "#e2a829", // mustard (anchor)
    "#2e7d6c", // deep teal
    "#1f5fa8", // ink blue
    "#7b3fa0", // royal purple
    "#cc5500", // burnt orange
    "#3a8a3f", // forest green
    "#b03060", // dusky pink
    "#5d6770", // slate
    "#8b6f1f", // olive
    "#0d8a8a", // dark cyan
];

/**
 * Resolve a stable colour for a player given the league's full player roster.
 *
 * Sorts the supplied ids ascending so a player keeps their colour as long as
 * the league composition is unchanged. Modulo-wraps if the league ever grows
 * past LEADERBOARD_COLORS.length.
 */
export function colorForPlayerId(playerId: number, allPlayerIds: readonly number[]): string {
    const sorted = [...allPlayerIds].sort((a, b) => a - b);
    const index = sorted.indexOf(playerId);
    if (index === -1) {
        // Defensive: caller passed an id that isn't in the roster. Fall back
        // to colour 0 rather than throwing — the chart should still render.
        return LEADERBOARD_COLORS[0]!;
    }
    return LEADERBOARD_COLORS[index % LEADERBOARD_COLORS.length]!;
}
