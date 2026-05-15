import "server-only";
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
    homeTeam: { id: number; name: string; tla: string | null };
    awayTeam: { id: number; name: string; tla: string | null };
    score: {
        winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
        fullTime: { home: number | null; away: number | null };
    };
    venue?: string | null;
}

interface FdTeam {
    id: number;
    name: string;
    tla: string | null;
}

async function fd<T>(path: string): Promise<T> {
    if (env.FOOTBALL_DATA_TOKEN === "") {
        throw new Error("FOOTBALL_DATA_TOKEN is not set");
    }
    const res = await fetch(`${BASE}${path}`, {
        headers: { "X-Auth-Token": env.FOOTBALL_DATA_TOKEN },
        // Always fresh — we cache at the DB layer.
        cache: "no-store",
    });
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

export type { FdMatch, FdTeam };

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
