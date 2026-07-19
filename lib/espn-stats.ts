/**
 * Client for ESPN's public soccer statistics API.
 *
 * No auth required. Provides tournament-level leaderboards for goals and
 * assists — the two stats football-data.org doesn't expose as dedicated
 * endpoints.
 *
 * Endpoint: /apis/site/v2/sports/soccer/fifa.world/statistics
 * Returns: { stats: [{ name: "goalsLeaders", leaders: [...] }, { name: "assistsLeaders", leaders: [...] }] }
 */

const STATS_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/statistics";

// ─── Response types ────────────────────────────────────────────────────────────

interface EspnTeam {
    id: string;
    name: string;
    abbreviation: string;
    displayName: string;
}

interface EspnStatEntry {
    name: string;
    value: number;
    displayValue: string;
}

interface EspnAthlete {
    id: string;
    displayName: string;
    shortName: string;
    team: EspnTeam;
    statistics?: EspnStatEntry[];
}

interface EspnLeaderEntry {
    displayValue: string;
    value: number;
    athlete: EspnAthlete;
}

interface EspnStatCategory {
    name: string;
    displayName: string;
    leaders: EspnLeaderEntry[];
}

interface EspnStatsResponse {
    stats: EspnStatCategory[];
}

// ─── Public types ──────────────────────────────────────────────────────────────

export interface AssistLeader {
    playerName: string;
    teamName: string;
    teamCode: string;
    assists: number;
    goals: number;
}

export interface GoalLeader {
    playerName: string;
    teamName: string;
    teamCode: string;
    goals: number;
    assists: number;
}

/** Team-level discipline entry (yellow cards, red cards, discipline points). */
export interface DisciplineEntry {
    teamId: string;
    teamName: string;
    matchesPlayed: number;
    yellowCards: number;
    redCards: number;
    /** ESPN's discipline points: yellow=1, red=3. Higher = worse. */
    points: number;
}

// ─── Cache ─────────────────────────────────────────────────────────────────────
// Single request serves both goals and assists. Cache for 30 minutes — these
// leaderboards only change when matches finish.

const CACHE_TTL_MS = 30 * 60_000;

interface CachedStats {
    goals: GoalLeader[];
    assists: AssistLeader[];
    fetchedAt: number;
}

let cache: CachedStats | null = null;

// ─── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchStats(): Promise<CachedStats | null> {
    if (cache !== null && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
        return cache;
    }

    try {
        const res = await fetch(STATS_URL, { cache: "no-store" });
        if (!res.ok) {
            console.warn(`[espn-stats] failed: ${res.status}`);
            return cache;
        }
        const data: EspnStatsResponse = await res.json();

        const goalsCategory = data.stats.find((s) => s.name === "goalsLeaders");
        const assistsCategory = data.stats.find((s) => s.name === "assistsLeaders");

        const goals: GoalLeader[] = (goalsCategory?.leaders ?? []).map((entry) => {
            const goalsStat = entry.athlete.statistics?.find((s) => s.name === "totalGoals");
            const assistsStat = entry.athlete.statistics?.find((s) => s.name === "goalAssists");
            return {
                playerName: entry.athlete.displayName,
                teamName: entry.athlete.team.displayName,
                teamCode: entry.athlete.team.abbreviation,
                goals: goalsStat?.value ?? entry.value,
                assists: assistsStat?.value ?? 0,
            };
        });

        const assists: AssistLeader[] = (assistsCategory?.leaders ?? []).map((entry) => {
            const goalsStat = entry.athlete.statistics?.find((s) => s.name === "totalGoals");
            const assistsStat = entry.athlete.statistics?.find((s) => s.name === "goalAssists");
            return {
                playerName: entry.athlete.displayName,
                teamName: entry.athlete.team.displayName,
                teamCode: entry.athlete.team.abbreviation,
                assists: assistsStat?.value ?? entry.value,
                goals: goalsStat?.value ?? 0,
            };
        });

        cache = { goals, assists, fetchedAt: Date.now() };
        return cache;
    } catch (e) {
        console.warn("[espn-stats] error:", e);
        return cache;
    }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function fetchTopAssists(): Promise<AssistLeader[] | null> {
    const stats = await fetchStats();
    if (stats === null) {
        return null;
    }
    return stats.assists;
}

export async function fetchTopGoals(): Promise<GoalLeader[] | null> {
    const stats = await fetchStats();
    if (stats === null) {
        return null;
    }
    return stats.goals;
}

/**
 * ESPN team name → our DB team name overrides. Case-insensitive match is
 * tried first; anything in this map is an explicit alias for the pairs where
 * ESPN and our seed disagree. Extend as new mismatches surface (they'll log
 * a warning from the auto-resolver).
 */
export const ESPN_TEAM_NAME_ALIASES: Record<string, string> = {
    "türkiye": "Turkey",
    "cape verde": "Cape Verde Islands",
};

/**
 * Resolve an ESPN team name to our canonical DB team name. Returns the input
 * unchanged when no alias applies — callers still do a case-insensitive DB
 * lookup, which handles the majority of names.
 */
export function resolveEspnTeamName(espnName: string): string {
    return ESPN_TEAM_NAME_ALIASES[espnName.toLowerCase()] ?? espnName;
}

// ─── Discipline (team-level) ───────────────────────────────────────────────────
//
// The stats API doesn't expose discipline categories, so we scrape the HTML
// discipline page. The page inlines a `window.__espnfitt__ = {...}` JSON blob
// with the full table already parsed — no DOM scraping needed. Pull that blob,
// find the discipline table under page.content.statistics.tableRows, and
// project into DisciplineEntry.
//
// Row shape (from observed responses): [rank?, teamCell, P, YC, RC, PTS]
// where teamCell is { id, name, href } and the numeric cells are
// { isStats: true, value: number }.

const DISCIPLINE_URL =
    "https://www.espn.co.uk/football/stats/_/league/FIFA.WORLD/view/discipline";

interface DisciplineCachedStats {
    entries: DisciplineEntry[];
    fetchedAt: number;
}

let disciplineCache: DisciplineCachedStats | null = null;

function extractStatsValue(cell: unknown): number {
    if (typeof cell === "object" && cell !== null && "value" in cell) {
        const v = (cell as { value: unknown }).value;
        if (typeof v === "number") {
            return v;
        }
    }
    return 0;
}

async function fetchDisciplineFromEspn(): Promise<DisciplineEntry[] | null> {
    if (
        disciplineCache !== null &&
        Date.now() - disciplineCache.fetchedAt < CACHE_TTL_MS
    ) {
        return disciplineCache.entries;
    }

    try {
        // Mimic a real browser UA — ESPN's HTML pages 403 for generic fetchers.
        const res = await fetch(DISCIPLINE_URL, {
            cache: "no-store",
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
            },
        });
        if (!res.ok) {
            console.warn(`[espn-stats] discipline fetch failed: ${res.status}`);
            return disciplineCache?.entries ?? null;
        }
        const html = await res.text();

        // Blob is assigned via `window['__espnfitt__'] = { ... };` — grab
        // everything between the opening `{` and the terminating `};`.
        const marker = "window['__espnfitt__'] = ";
        const startIdx = html.indexOf(marker);
        if (startIdx === -1) {
            console.warn("[espn-stats] discipline: __espnfitt__ blob not found");
            return disciplineCache?.entries ?? null;
        }
        const jsonStart = html.indexOf("{", startIdx);
        const jsonEnd = html.indexOf("};", jsonStart);
        if (jsonStart === -1 || jsonEnd === -1) {
            console.warn("[espn-stats] discipline: could not locate blob bounds");
            return disciplineCache?.entries ?? null;
        }
        const blob = JSON.parse(html.slice(jsonStart, jsonEnd + 1)) as {
            page?: {
                content?: {
                    statistics?: {
                        tableRows?: unknown[][][];
                    };
                };
            };
        };

        const tableRows = blob.page?.content?.statistics?.tableRows?.[0];
        if (tableRows === undefined) {
            console.warn("[espn-stats] discipline: tableRows missing from blob");
            return disciplineCache?.entries ?? null;
        }

        // Rows: [rankMaybeBlank, teamCell, P, YC, RC, PTS]. We identify columns
        // by position rather than by header text — ESPN's headers are localised.
        const entries: DisciplineEntry[] = [];
        for (const row of tableRows) {
            const teamCell = row[1];
            if (
                typeof teamCell !== "object" ||
                teamCell === null ||
                !("id" in teamCell) ||
                !("name" in teamCell)
            ) {
                continue;
            }
            const team = teamCell as { id: string; name: string };
            entries.push({
                teamId: team.id,
                teamName: team.name,
                matchesPlayed: extractStatsValue(row[2]),
                yellowCards: extractStatsValue(row[3]),
                redCards: extractStatsValue(row[4]),
                points: extractStatsValue(row[5]),
            });
        }

        disciplineCache = { entries, fetchedAt: Date.now() };
        return entries;
    } catch (e) {
        console.warn("[espn-stats] discipline error:", e);
        return disciplineCache?.entries ?? null;
    }
}

/**
 * Team-level discipline leaderboard from ESPN's discipline stats page. Used
 * to auto-resolve PANTOMIME_VILLAIN — the team with the most discipline
 * points (yellow=1, red=3) wins the bonus. Returns null on fetch failure.
 */
export async function fetchTeamDiscipline(): Promise<DisciplineEntry[] | null> {
    return fetchDisciplineFromEspn();
}
