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
