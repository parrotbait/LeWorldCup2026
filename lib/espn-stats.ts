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
        // Mimic a real browser — ESPN's HTML pages 403 for generic fetchers
        // and (worse) sometimes serve a slimmer bot template that omits the
        // __espnfitt__ blob entirely. UA + Accept-Language make the response
        // consistent between local dev and serverless egress (Vercel).
        const res = await fetch(DISCIPLINE_URL, {
            cache: "no-store",
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
                "Accept":
                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-GB,en;q=0.9",
            },
        });
        if (!res.ok) {
            console.warn(`[espn-stats] discipline fetch failed: ${res.status}`);
            return disciplineCache?.entries ?? null;
        }
        const html = await res.text();
        // Diagnostics: dump response shape when the marker doesn't match, so we
        // can tell whether ESPN sent a bot wall, a redirect landing page, or a
        // real page with a different assignment syntax. Cheap: only fires on
        // the failure path.
        const logResponseShape = (reason: string): void => {
            const finalUrl = res.url;
            const contentType = res.headers.get("content-type") ?? "?";
            const length = html.length;
            const head = html.slice(0, 400).replace(/\s+/g, " ");
            const espnfittIdx = html.indexOf("__espnfitt__");
            const espnfittContext =
                espnfittIdx === -1
                    ? "(not present)"
                    : html.slice(Math.max(0, espnfittIdx - 40), espnfittIdx + 120)
                          .replace(/\s+/g, " ");
            console.warn(
                `[espn-stats] discipline ${reason}: status=${res.status} finalUrl=${finalUrl} contentType=${contentType} bodyLength=${length} head=${JSON.stringify(head)} espnfittContext=${JSON.stringify(espnfittContext)}`,
            );
        };

        // Walk the JSON forward from the opening `{`, tracking string state and
        // escapes, and stop when the outer object closes. A naive
        // indexOf("};") breaks whenever the blob contains that literal inside a
        // string value (SyntaxError on JSON.parse) — brace counting is safe.
        //
        // Marker matching is intentionally loose: ESPN serves slightly
        // different variants to different regions/IPs (Vercel egress vs local
        // dev), and the assignment can appear as `window['__espnfitt__']`,
        // `window["__espnfitt__"]`, or `window.__espnfitt__`. Match all three.
        const markerRegex = /window\s*(?:\[\s*['"]__espnfitt__['"]\s*\]|\.__espnfitt__)\s*=\s*/;
        const markerMatch = markerRegex.exec(html);
        if (markerMatch === null) {
            logResponseShape("__espnfitt__ blob not found");
            return disciplineCache?.entries ?? null;
        }
        const jsonStart = html.indexOf("{", markerMatch.index + markerMatch[0].length - 1);
        if (jsonStart === -1) {
            logResponseShape("could not locate blob start");
            return disciplineCache?.entries ?? null;
        }
        let depth = 0;
        let inString = false;
        let escaped = false;
        let jsonEnd = -1;
        for (let i = jsonStart; i < html.length; i++) {
            const ch = html[i];
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (ch === "\\") {
                    escaped = true;
                } else if (ch === '"') {
                    inString = false;
                }
                continue;
            }
            if (ch === '"') {
                inString = true;
            } else if (ch === "{") {
                depth += 1;
            } else if (ch === "}") {
                depth -= 1;
                if (depth === 0) {
                    jsonEnd = i;
                    break;
                }
            }
        }
        if (jsonEnd === -1) {
            logResponseShape("could not locate blob end");
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
 *
 * **Not wired up in production.** The `/football/stats/.../discipline` HTML
 * page is behind AWS WAF (JavaScript challenge / gokuProps) from serverless
 * egress — Vercel gets a 202 with a ~2KB stub, not the real page with the
 * `__espnfitt__` blob. Local dev works because your IP has a good reputation.
 * PANTOMIME_VILLAIN is resolved manually by admin from the public ESPN page.
 * Left in place in case we later route this call through a residential
 * proxy, Cloudflare Workers egress, or a scheduled sync from a different host.
 */
export async function fetchTeamDiscipline(): Promise<DisciplineEntry[] | null> {
    return fetchDisciplineFromEspn();
}
