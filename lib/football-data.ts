import { env } from "./env";

/**
 * Tiny client for football-data.org v4.
 *
 * Free tier: 10 req/min. The whole tournament is competition code "WC".
 * Docs: https://www.football-data.org/documentation/api
 *
 * We only call this from the cron route and from the seed script — never from
 * the request path — so the rate limit is never tight.
 */

const BASE = "https://api.football-data.org/v4";

interface FdMatch {
    id: number;
    utcDate: string;
    status: string;
    matchday: number | null;
    stage: string;
    group: string | null;
    minute: number | null;
    homeTeam: { id: number; name: string; tla: string | null };
    awayTeam: { id: number; name: string; tla: string | null };
    score: {
        winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
        fullTime: { home: number | null; away: number | null };
        extraTime?: { home: number | null; away: number | null } | null;
        penalties?: { home: number | null; away: number | null } | null;
    };
    venue?: string | null;
}

interface FdTeam {
    id: number;
    name: string;
    tla: string | null;
}

interface FdScorer {
    player: { id: number; name: string; position: string | null; dateOfBirth: string | null };
    team: { id: number; name: string; tla: string | null };
    goals: number;
    assists: number | null;
    penalties: number | null;
}

async function fd<T>(path: string, opts?: { revalidate?: number; tags?: string[] }): Promise<T> {
    if (env.FOOTBALL_DATA_TOKEN === "") {
        throw new Error("FOOTBALL_DATA_TOKEN is not set");
    }
    const init: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {
        headers: { "X-Auth-Token": env.FOOTBALL_DATA_TOKEN },
    };
    if (opts?.revalidate !== undefined || opts?.tags !== undefined) {
        init.next = {};
        if (opts.revalidate !== undefined) {
            init.next.revalidate = opts.revalidate;
        }
        if (opts.tags !== undefined) {
            init.next.tags = opts.tags;
        }
    } else {
        // Cron + sim path — always fresh.
        init.cache = "no-store";
    }
    const res = await fetch(`${BASE}${path}`, init);
    if (!res.ok) {
        throw new Error(`football-data ${path} failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
}

export async function fetchTeams(): Promise<FdTeam[]> {
    const data = await fd<{ teams: FdTeam[] }>("/competitions/WC/teams");
    return data.teams;
}

export async function fetchMatches(): Promise<FdMatch[]> {
    const data = await fd<{ matches: FdMatch[] }>("/competitions/WC/matches");
    return data.matches;
}

/**
 * Top-N goalscorer leaderboard for the WC. Each row carries goals, assists,
 * and penalty count. The shape covers both the Golden Boot and Most Assists
 * live-leader displays — same endpoint, different metric.
 *
 * Cached for 5 min via Next's data cache so /bonuses and /stats don't
 * hammer the free tier (10 req/min). Tag `live-leaders` is invalidated by
 * the cron sync so refreshes can be forced.
 */
export async function fetchScorers(): Promise<FdScorer[]> {
    const data = await fd<{ scorers: FdScorer[] }>(
        "/competitions/WC/scorers?limit=100",
        { revalidate: 300, tags: ["live-leaders"] },
    );
    return data.scorers;
}

export interface LiveMinuteInfo {
    externalId: number;
    minute: number | null;
}

/**
 * Fetch just the live minute data for in-play matches. Uses the same
 * /matches endpoint but only extracts the minute field for LIVE matches.
 * Called from sync-pulse when no sync ran and the in-memory cache is stale.
 */
export async function fetchMatchMinutes(): Promise<LiveMinuteInfo[]> {
    const data = await fd<{ matches: FdMatch[] }>("/competitions/WC/matches");
    return data.matches
        .filter((m) => m.status === "IN_PLAY" || m.status === "PAUSED")
        .map((m) => ({
            externalId: m.id,
            minute: m.minute,
        }));
}

/**
 * SSR-safe variant cached for 60s via Next's data cache. Used to seed the
 * initial LiveStatusBadge render so there's no flash of "live" → "67′".
 */
export async function fetchMatchMinutesCached(): Promise<LiveMinuteInfo[]> {
    const data = await fd<{ matches: FdMatch[] }>(
        "/competitions/WC/matches",
        { revalidate: 60, tags: ["live-minutes"] },
    );
    return data.matches
        .filter((m) => m.status === "IN_PLAY" || m.status === "PAUSED")
        .map((m) => ({
            externalId: m.id,
            minute: m.minute,
        }));
}

export type { FdMatch, FdTeam, FdScorer };

/**
 * Map football-data stage names → our `roundEnum` values.
 *
 * 2026 introduces a Round of 32. football-data's exact stage labels may need
 * verification once the WC fixture data lands; we err toward broad mapping.
 */
export function mapStage(stage: string): "GROUP" | "R32" | "R16" | "QF" | "SF" | "THIRD" | "FINAL" {
    switch (stage) {
        case "GROUP_STAGE":
        case "GROUP":
            return "GROUP";
        case "LAST_32":
        case "ROUND_OF_32":
            return "R32";
        case "LAST_16":
        case "ROUND_OF_16":
            return "R16";
        case "QUARTER_FINALS":
            return "QF";
        case "SEMI_FINALS":
            return "SF";
        case "THIRD_PLACE":
            return "THIRD";
        case "FINAL":
            return "FINAL";
        default:
            // Default to GROUP rather than throw — admin can override if mis-mapped.
            return "GROUP";
    }
}
