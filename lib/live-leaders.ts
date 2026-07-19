/**
 * "Currently leading" calculations for /bonuses cards and the /stats page.
 *
 * Three flavours:
 *  - Player-stat leaders (Golden Boot, Most Assists) come from football-data
 *    /competitions/WC/scorers, cached 5 min via Next data-cache.
 *  - Team-progress leaders (Dark Horse, Sieve, Wooden Spoon, Tournament
 *    Winner) come from our own `matches` table — no extra API call.
 *  - Pantomime Villain is hidden ("data n/a"). Football-data's free tier
 *    does not surface card counts in /scorers; admin resolves manually.
 *
 * Team leaders are hidden until at least one match has FINISHED, so empty-
 * tournament cards stay quiet instead of showing nonsense like
 * "Currently: 0 conceded".
 */

import { eq } from "drizzle-orm";
import { db as dbInstance } from "@/db/client";
import { matches, teams } from "@/db/schema";
import { type AssistLeader, type GoalLeader, fetchTopAssists, fetchTopGoals } from "@/lib/espn-stats";
import { findPlayer } from "@/lib/players";
import { topByMetric, sortWoodenSpoonCandidates } from "@/lib/live-leaders-pure";

export type LiveLeader =
    | { kind: "single"; displayName: string; metric: number; teamCode?: string }
    | { kind: "tied-pair"; names: [string, string]; metric: number; teamCodes?: [string, string] }
    | { kind: "tied-many"; count: number; metric: number; subjectPlural: string }
    | { kind: "unavailable"; reason: string }
    | { kind: "hidden"; reason: "no_rounds_played" | "no_data_yet" };

type DB = typeof dbInstance;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function hasAnyRoundCompleted(db: DB): Promise<boolean> {
    const finished = await db
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.status, "FINISHED"))
        .limit(1);
    return finished.length > 0;
}

/** ESPN's AssistLeader shape → LiveLeader; mirrors asPlayerLeader for FdScorer. */
function asEspnPlayerLeader(top: { value: number; tied: AssistLeader[] }): LiveLeader {
    return asEspnLeader(top);
}

/** Same shape adapter for ESPN GoalLeader entries. */
function asEspnGoalLeader(top: { value: number; tied: GoalLeader[] }): LiveLeader {
    return asEspnLeader(top);
}

/**
 * Shared adapter for ESPN player-leaderboard rows (assists or goals). Both
 * types have `playerName` and `teamCode`; the caller has already computed
 * which metric produced `top.value`.
 */
function asEspnLeader(
    top: { value: number; tied: { playerName: string; teamCode: string }[] },
): LiveLeader {
    if (top.tied.length === 1) {
        const s = top.tied[0]!;
        const canonical = findPlayer(s.playerName);
        return {
            kind: "single",
            displayName: canonical?.displayName ?? s.playerName,
            metric: top.value,
            teamCode: s.teamCode,
        };
    }
    if (top.tied.length === 2) {
        const a = top.tied[0]!;
        const b = top.tied[1]!;
        return {
            kind: "tied-pair",
            names: [
                findPlayer(a.playerName)?.displayName ?? a.playerName,
                findPlayer(b.playerName)?.displayName ?? b.playerName,
            ],
            metric: top.value,
            teamCodes: [a.teamCode, b.teamCode],
        };
    }
    return {
        kind: "tied-many",
        count: top.tied.length,
        metric: top.value,
        subjectPlural: "players",
    };
}

interface TeamRow {
    id: number;
    code: string;
    name: string;
}

function asTeamLeader(
    top: { value: number; tied: TeamRow[] },
    subjectPlural: "teams",
): LiveLeader {
    if (top.tied.length === 1) {
        const t = top.tied[0]!;
        return {
            kind: "single",
            displayName: t.name,
            metric: top.value,
            teamCode: t.code,
        };
    }
    if (top.tied.length === 2) {
        const a = top.tied[0]!;
        const b = top.tied[1]!;
        return {
            kind: "tied-pair",
            names: [a.name, b.name],
            metric: top.value,
            teamCodes: [a.code, b.code],
        };
    }
    return {
        kind: "tied-many",
        count: top.tied.length,
        metric: top.value,
        subjectPlural,
    };
}

// ---------------------------------------------------------------------------
// Player-stat leaders
// ---------------------------------------------------------------------------

export async function getTopScorerLeader(): Promise<LiveLeader> {
    // Sourced from ESPN so the chip matches the /stats page (and the
    // auto-resolved TOP_SCORER bonus row). See the MOST_ASSISTS comment
    // above — same reasoning: football-data /scorers disagreed at the
    // free tier and named different players than users saw on Stats.
    let goalLeaders: Awaited<ReturnType<typeof fetchTopGoals>>;
    try {
        goalLeaders = await fetchTopGoals();
    } catch {
        return { kind: "unavailable", reason: "espn_fetch_failed" };
    }
    if (goalLeaders === null) {
        return { kind: "unavailable", reason: "espn_fetch_failed" };
    }
    if (goalLeaders.length === 0) {
        return { kind: "hidden", reason: "no_data_yet" };
    }
    const top = topByMetric(goalLeaders, (g) => g.goals);
    if (top === null || top.value === 0) {
        return { kind: "hidden", reason: "no_data_yet" };
    }
    return asEspnGoalLeader(top);
}

export async function getMostAssistsLeader(): Promise<LiveLeader> {
    // Assists come from ESPN (same source the /stats page uses) so the
    // "Most assists" chip on /bonuses and the auto-resolved MOST_ASSISTS
    // winner match what players see on the stats leaderboard. Previously
    // pulled from football-data /scorers, which disagreed with ESPN on
    // free-tier data and produced confusing name mismatches.
    let assistLeaders: Awaited<ReturnType<typeof fetchTopAssists>>;
    try {
        assistLeaders = await fetchTopAssists();
    } catch {
        return { kind: "unavailable", reason: "espn_fetch_failed" };
    }
    if (assistLeaders === null) {
        return { kind: "unavailable", reason: "espn_fetch_failed" };
    }
    if (assistLeaders.length === 0) {
        return { kind: "hidden", reason: "no_data_yet" };
    }
    const top = topByMetric(assistLeaders, (a) => a.assists);
    if (top === null) {
        return { kind: "hidden", reason: "no_data_yet" };
    }
    return asEspnPlayerLeader(top);
}

// ---------------------------------------------------------------------------
// Team-progress leaders
// ---------------------------------------------------------------------------

const ROUND_RANK: Record<string, number> = {
    GROUP: 0,
    R32: 1,
    R16: 2,
    QF: 3,
    SF: 4,
    THIRD: 5,
    FINAL: 6,
};

interface TeamProgress extends TeamRow {
    pot: number | null;
    furthestRoundRank: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
}

async function loadTeamProgress(db: DB): Promise<TeamProgress[]> {
    const allTeams = await db.select().from(teams);
    const allMatches = await db.select().from(matches);

    const byId = new Map<number, TeamProgress>();
    for (const t of allTeams) {
        byId.set(t.id, {
            id: t.id,
            code: t.code,
            name: t.name,
            pot: t.pot,
            furthestRoundRank: -1,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0,
        });
    }
    for (const m of allMatches) {
        if (m.homeTeamId !== null) {
            const p = byId.get(m.homeTeamId);
            if (p !== undefined) {
                const rank = ROUND_RANK[m.round] ?? -1;
                if (rank > p.furthestRoundRank) {
                    p.furthestRoundRank = rank;
                }
            }
        }
        if (m.awayTeamId !== null) {
            const p = byId.get(m.awayTeamId);
            if (p !== undefined) {
                const rank = ROUND_RANK[m.round] ?? -1;
                if (rank > p.furthestRoundRank) {
                    p.furthestRoundRank = rank;
                }
            }
        }
        if (
            m.status === "FINISHED" &&
            m.homeScore !== null &&
            m.awayScore !== null &&
            m.homeTeamId !== null &&
            m.awayTeamId !== null
        ) {
            const home = byId.get(m.homeTeamId);
            const away = byId.get(m.awayTeamId);
            if (home !== undefined && away !== undefined) {
                home.goalsFor += m.homeScore;
                home.goalsAgainst += m.awayScore;
                away.goalsFor += m.awayScore;
                away.goalsAgainst += m.homeScore;
                if (m.homeScore > m.awayScore) {
                    home.points += 3;
                } else if (m.awayScore > m.homeScore) {
                    away.points += 3;
                } else {
                    home.points += 1;
                    away.points += 1;
                }
            }
        }
    }
    return Array.from(byId.values());
}

export async function getDarkHorseLeader(db: DB = dbInstance): Promise<LiveLeader> {
    // Dark horse progress is cumulative — a "currently leading" chip doesn't
    // convey useful information mid-tournament. The bonus breakdown table and
    // the player profile already show earned points. Hide the chip entirely.
    return { kind: "hidden", reason: "no_data_yet" };
}

export async function getSieveLeader(db: DB = dbInstance): Promise<LiveLeader> {
    if (!(await hasAnyRoundCompleted(db))) {
        return { kind: "hidden", reason: "no_rounds_played" };
    }
    const all = await loadTeamProgress(db);
    const top = topByMetric(all, (t) => t.goalsAgainst);
    if (top === null) {
        return { kind: "hidden", reason: "no_data_yet" };
    }
    return asTeamLeader(top, "teams");
}

export async function getWoodenSpoonLeader(db: DB = dbInstance): Promise<LiveLeader> {
    // The wooden spoon goes to the team finishing bottom of their group with
    // the worst record overall. Until R32 fixtures are filled we can't know
    // which teams are actually eliminated — showing a "currently" chip before
    // that point is misleading (it would pick a team still in contention).
    if (!(await hasAnyRoundCompleted(db))) {
        return { kind: "hidden", reason: "no_rounds_played" };
    }
    const all = await loadTeamProgress(db);
    const r32Played = all.some((t) => t.furthestRoundRank >= ROUND_RANK.R32);
    if (!r32Played) {
        return { kind: "hidden", reason: "no_data_yet" };
    }
    // Only teams that didn't make R32 are wooden spoon candidates.
    const eliminated = all.filter((t) => t.furthestRoundRank < ROUND_RANK.R32);
    if (eliminated.length === 0) {
        return { kind: "hidden", reason: "no_data_yet" };
    }
    // Tiebreak: fewest points → worst goal difference → fewest goals scored.
    const sorted = sortWoodenSpoonCandidates(eliminated);
    const worst = sorted[0]!;
    const tied = sorted.filter((t) => {
        const gdT = t.goalsFor - t.goalsAgainst;
        const gdW = worst.goalsFor - worst.goalsAgainst;
        return t.points === worst.points && gdT === gdW && t.goalsFor === worst.goalsFor;
    });
    return asTeamLeader({ value: worst.points, tied }, "teams");
}

export async function getTournamentWinnerLeader(db: DB = dbInstance): Promise<LiveLeader> {
    // Only meaningful after the FINAL has been settled. Until then we don't
    // pretend to know — the chip stays hidden.
    const finalRow = (
        await db
            .select({ winnerTeamId: matches.winnerTeamId })
            .from(matches)
            .where(eq(matches.round, "FINAL"))
            .limit(1)
    )[0];
    if (
        finalRow === undefined ||
        finalRow.winnerTeamId === null ||
        finalRow.winnerTeamId === undefined
    ) {
        return { kind: "hidden", reason: "no_data_yet" };
    }
    const team = (
        await db
            .select({ id: teams.id, code: teams.code, name: teams.name })
            .from(teams)
            .where(eq(teams.id, finalRow.winnerTeamId))
            .limit(1)
    )[0];
    if (team === undefined) {
        return { kind: "hidden", reason: "no_data_yet" };
    }
    return { kind: "single", displayName: team.name, metric: 1, teamCode: team.code };
}

export async function getMightyFallenLeader(db: DB = dbInstance): Promise<LiveLeader> {
    // "Mighty fallen" is a binary outcome — a Pot-1 team either crashed out in
    // groups or didn't. There's no "currently leading" concept here. The result
    // displays via BonusResultChip once admin resolves it (or no result if no
    // Pot-1 team was eliminated).
    return { kind: "hidden", reason: "no_data_yet" };
}

export async function getPantomimeVillainLeader(): Promise<LiveLeader> {
    // Admin-only bonus: the ESPN discipline HTML page is behind AWS WAF from
    // serverless egress (Vercel gets a 202 challenge stub), and there's no
    // equivalent JSON endpoint. Chip stays hidden; admin resolves manually
    // from ESPN's public discipline table.
    return { kind: "unavailable", reason: "espn_waf_blocks_scraping" };
}
