/**
 * Player line colors for the leaderboard chart.
 *
 * Returns CSS custom-property references so the actual hex resolves at
 * render time based on `prefers-color-scheme`. The variables are defined in
 * `app/globals.css` under `:root` (light) and the dark-mode media query
 * (dark). Both modes share the same hue order so a given player keeps the
 * same colour identity across modes — only the lightness/saturation
 * differs.
 *
 * Assignment is deterministic by `players.id` ascending — see
 * colorForPlayerId. Modulo-wraps once the league exceeds 11.
 */
export const LEADERBOARD_COLOR_COUNT = 11;

/**
 * Resolve a stable CSS-var colour for a player given the league's full
 * roster. The returned string is something like `var(--lb-color-3)` which
 * the browser substitutes per `prefers-color-scheme`.
 */
export function colorForPlayerId(playerId: number, allPlayerIds: readonly number[]): string {
    const sorted = [...allPlayerIds].sort((a, b) => a - b);
    const index = sorted.indexOf(playerId);
    if (index === -1) {
        return "var(--lb-color-1)";
    }
    const slot = (index % LEADERBOARD_COLOR_COUNT) + 1;
    return `var(--lb-color-${slot})`;
}

/**
 * The CSS-var fallback used when a player id can't be resolved (defensive).
 * Exposed for components that need a non-undefined colour string while still
 * loading data.
 */
export const FALLBACK_LEADERBOARD_COLOR = "var(--lb-color-1)";

/**
 * Backwards-compat: a few callers used the array of hex values directly.
 * Now exposed as the same number of CSS-var references so colours are
 * mode-aware everywhere they're consumed.
 */
export const LEADERBOARD_COLORS: readonly string[] = Array.from(
    { length: LEADERBOARD_COLOR_COUNT },
    (_, i) => `var(--lb-color-${i + 1})`,
);
