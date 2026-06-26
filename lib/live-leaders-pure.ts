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

export interface WoodenSpoonCandidate {
    id: number;
    name: string;
    points: number;
    goalsFor: number;
    goalsAgainst: number;
}

/**
 * Sort wooden spoon candidates worst-first: fewest points → worst GD → fewest GF.
 * Returns a new sorted array (does not mutate input).
 */
export function sortWoodenSpoonCandidates<T extends WoodenSpoonCandidate>(
    candidates: T[],
): T[] {
    return [...candidates].sort((a, b) => {
        if (a.points !== b.points) {
            return a.points - b.points;
        }
        const gdA = a.goalsFor - a.goalsAgainst;
        const gdB = b.goalsFor - b.goalsAgainst;
        if (gdA !== gdB) {
            return gdA - gdB;
        }
        return a.goalsFor - b.goalsFor;
    });
}
