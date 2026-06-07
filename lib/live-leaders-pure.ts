/**
 * Pure helpers for live-leaders, separated from the DB-touching module so
 * unit tests can import them without standing up a Postgres connection.
 */

/**
 * Generic top-N reducer. Returns the tied set of subjects sharing the
 * highest metric value, or null if the input is empty / all-zero.
 */
export function topByMetric<T>(
    rows: T[],
    metric: (t: T) => number | null | undefined,
): { value: number; tied: T[] } | null {
    let best = -Infinity;
    let tied: T[] = [];
    for (const row of rows) {
        const v = metric(row);
        if (v === null || v === undefined) {
            continue;
        }
        if (v > best) {
            best = v;
            tied = [row];
        } else if (v === best) {
            tied.push(row);
        }
    }
    if (tied.length === 0 || best <= 0) {
        return null;
    }
    return { value: best, tied };
}
