/**
 * Pull teams + matches from football-data.org and upsert into our DB.
 *
 * Called by:
 *  - app/api/cron/sync-results/route.ts (Vercel cron)
 *  - app/actions/admin.ts triggerSyncAction (admin "Sync now" button)
 *
 * Returns counters + any per-step errors so the caller can render a result
 * to the user (audit-log on top of that). Idempotent — safe to run as often
 * as you like, subject to football-data's 10 req/min free-tier limit.
 */

import { eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/db/client";
import { auditLog, matches, teams } from "@/db/schema";
import { fetchMatches, fetchTeams, mapStage } from "@/lib/football-data";

export interface SyncResult {
    teamCount: number;
    matchCount: number;
    errors: string[];
    actor: string;
}

export async function syncResultsFromFootballData(actor: string): Promise<SyncResult> {
    let teamCount = 0;
    let matchCount = 0;
    const errors: string[] = [];

    try {
        const fdTeams = await fetchTeams();
        for (const t of fdTeams) {
            if (t.tla === null) {
                continue;
            }
            await db
                .insert(teams)
                .values({ code: t.tla, name: t.name })
                .onConflictDoUpdate({
                    target: teams.code,
                    set: { name: t.name },
                });
            teamCount += 1;
        }
    } catch (e) {
        errors.push(`teams: ${(e as Error).message}`);
    }

    try {
        const fdMatches = await fetchMatches();
        // Track which teams belong to which group as we go — football-data
        // carries the group letter on the match, not on /teams, so we backfill
        // from there.
        const groupByTeamId = new Map<number, string>();
        for (const m of fdMatches) {
            const homeTeam = m.homeTeam.tla
                ? (await db.select().from(teams).where(eq(teams.code, m.homeTeam.tla)).limit(1))[0]
                : undefined;
            const awayTeam = m.awayTeam.tla
                ? (await db.select().from(teams).where(eq(teams.code, m.awayTeam.tla)).limit(1))[0]
                : undefined;

            const status =
                m.status === "FINISHED"
                    ? "FINISHED"
                    : m.status === "IN_PLAY" || m.status === "PAUSED"
                      ? "LIVE"
                      : m.status === "POSTPONED"
                        ? "POSTPONED"
                        : m.status === "CANCELLED" || m.status === "SUSPENDED"
                          ? "CANCELLED"
                          : "SCHEDULED";

            const groupLetter = m.group?.replace("GROUP_", "") ?? null;
            if (groupLetter !== null) {
                if (homeTeam !== undefined) {
                    groupByTeamId.set(homeTeam.id, groupLetter);
                }
                if (awayTeam !== undefined) {
                    groupByTeamId.set(awayTeam.id, groupLetter);
                }
            }

            // Map football-data's winner enum to our team-id reference. Group
            // matches that ended in a draw (or any unfinished match) leave
            // winnerTeamId null; knockouts decided on penalties surface the
            // actual advancer here even though `score.fullTime` is a draw.
            const winnerTeamId =
                m.score.winner === "HOME_TEAM"
                    ? (homeTeam?.id ?? null)
                    : m.score.winner === "AWAY_TEAM"
                      ? (awayTeam?.id ?? null)
                      : null;

            // Canonical "scoring score": AET-final if extra time happened,
            // otherwise 90-min. Penalty shootouts are display-only — we keep
            // them in dedicated columns and never fold them into homeScore.
            const ftHome = m.score.fullTime.home;
            const ftAway = m.score.fullTime.away;
            const etHome = m.score.extraTime?.home ?? null;
            const etAway = m.score.extraTime?.away ?? null;
            const pensHome = m.score.penalties?.home ?? null;
            const pensAway = m.score.penalties?.away ?? null;
            const scoringHome = etHome ?? ftHome;
            const scoringAway = etAway ?? ftAway;

            const newKickoff = new Date(m.utcDate);
            // First-time lock cutoff for this fixture: 15 min before its
            // ORIGINAL kickoff. Drizzle won't overwrite this on conflict
            // because we omit it from the `set:` clause below.
            const firstLockedAt = new Date(newKickoff.getTime() - 15 * 60_000);

            // FD-renumber detection: if a non-overridden row already exists
            // with a different non-null home/away team, FD has likely reused
            // the externalId for a different fixture. Surface as an audit
            // entry so admin can investigate; we still apply the upsert.
            const existing = (
                await db
                    .select({
                        id: matches.id,
                        homeTeamId: matches.homeTeamId,
                        awayTeamId: matches.awayTeamId,
                        adminOverridden: matches.adminOverridden,
                    })
                    .from(matches)
                    .where(eq(matches.externalId, m.id))
                    .limit(1)
            )[0];
            if (
                existing !== undefined &&
                !existing.adminOverridden &&
                ((existing.homeTeamId !== null &&
                    homeTeam !== undefined &&
                    existing.homeTeamId !== homeTeam.id) ||
                    (existing.awayTeamId !== null &&
                        awayTeam !== undefined &&
                        existing.awayTeamId !== awayTeam.id))
            ) {
                errors.push(
                    `match externalId=${m.id} renumbered: was ${existing.homeTeamId}vs${existing.awayTeamId}, now ${homeTeam?.id ?? null}vs${awayTeam?.id ?? null}`,
                );
            }

            await db
                .insert(matches)
                .values({
                    externalId: m.id,
                    round: mapStage(m.stage),
                    groupLetter,
                    kickoff: newKickoff,
                    firstLockedAt,
                    homeTeamId: homeTeam?.id,
                    awayTeamId: awayTeam?.id,
                    homeScore: scoringHome,
                    awayScore: scoringAway,
                    homeScoreFt: ftHome,
                    awayScoreFt: ftAway,
                    homeScorePens: pensHome,
                    awayScorePens: pensAway,
                    winnerTeamId,
                    status,
                    venue: m.venue ?? null,
                })
                .onConflictDoUpdate({
                    target: matches.externalId,
                    set: {
                        // Admin-overridden rows are sacred — only the venue
                        // (cosmetic) and team-id (in case TBDs got resolved)
                        // may move. Score/status/kickoff/winner are frozen
                        // until clearOverrideAction. first_locked_at is also
                        // omitted unconditionally — once a match has ever
                        // passed its original lock, it stays locked.
                        kickoff: sql`CASE WHEN ${matches.adminOverridden} THEN ${matches.kickoff} ELSE ${newKickoff} END`,
                        homeTeamId: homeTeam?.id,
                        awayTeamId: awayTeam?.id,
                        homeScore: sql`CASE WHEN ${matches.adminOverridden} THEN ${matches.homeScore} ELSE ${scoringHome} END`,
                        awayScore: sql`CASE WHEN ${matches.adminOverridden} THEN ${matches.awayScore} ELSE ${scoringAway} END`,
                        homeScoreFt: sql`CASE WHEN ${matches.adminOverridden} THEN ${matches.homeScoreFt} ELSE ${ftHome} END`,
                        awayScoreFt: sql`CASE WHEN ${matches.adminOverridden} THEN ${matches.awayScoreFt} ELSE ${ftAway} END`,
                        homeScorePens: sql`CASE WHEN ${matches.adminOverridden} THEN ${matches.homeScorePens} ELSE ${pensHome} END`,
                        awayScorePens: sql`CASE WHEN ${matches.adminOverridden} THEN ${matches.awayScorePens} ELSE ${pensAway} END`,
                        winnerTeamId: sql`CASE WHEN ${matches.adminOverridden} THEN ${matches.winnerTeamId} ELSE ${winnerTeamId} END`,
                        status: sql`CASE WHEN ${matches.adminOverridden} THEN ${matches.status} ELSE ${status} END`,
                        venue: m.venue ?? null,
                    },
                });
            matchCount += 1;
        }

        // Backfill teams.group_letter from the matches we just processed.
        for (const [teamId, groupLetter] of groupByTeamId) {
            await db.update(teams).set({ groupLetter }).where(eq(teams.id, teamId));
        }
    } catch (e) {
        errors.push(`matches: ${(e as Error).message}`);
    }

    await db.insert(auditLog).values({
        actor,
        action: "sync-results",
        detail: JSON.stringify({ teamCount, matchCount, errors }),
    });

    // Bust the live-leaders cache so /bonuses + /stats reflect the new data
    // on next request, instead of serving the stale 5-min snapshot.
    try {
        revalidateTag("live-leaders");
    } catch {
        // revalidateTag throws when called outside a request scope (e.g. seed
        // scripts). Cron and admin actions both run in a request, so this
        // catch is just defensive against future callers.
    }

    return { teamCount, matchCount, errors, actor };
}
