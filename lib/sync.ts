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
 *
 * ## Integrity
 * After writing match data, the sync computes what the new leaderboard would
 * look like and compares it to the pre-sync state. If any player's points
 * decrease (a "regression"), the sync is aborted via transaction rollback and
 * a SyncRegressionError is thrown — unless SYNC_FORCE=1 is set.
 *
 * ## Performance
 * Teams are pre-loaded into a Map before the match loop, eliminating ~208
 * individual SELECT queries (one per home/away per match).
 *
 * ## Robustness
 * The entire match-write phase runs inside a DB transaction, so if the user
 * navigates away or the process crashes mid-sync, partial writes don't persist.
 */

import { eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/db/client";
import { auditLog, matches, players, teams } from "@/db/schema";
import { fetchMatches, fetchTeams, mapStage } from "@/lib/football-data";
import { computeSnapshotState, loadSnapshotInput, runSnapshotPipelineQuietly } from "@/lib/snapshot";
import {
    buildSyncAuditTrail,
    SyncRegressionError,
    type MatchState,
    type SyncAuditTrail,
} from "@/lib/sync-integrity";
import { autoResolveBonuses } from "@/lib/auto-resolve-bonuses";

export interface SyncResult {
    teamCount: number;
    matchCount: number;
    /** Per-status breakdown of matches written this run. */
    matchStatusCounts: Record<string, number>;
    /** Matches FD returned that we couldn't upsert; one entry per failure. */
    matchErrors: Array<{ externalId: number; message: string }>;
    /** Top-level errors (teams fetch, matches fetch, etc.). */
    errors: string[];
    /** Total wall-clock duration of the sync in ms. */
    durationMs: number;
    actor: string;
    /** Full diff audit trail (match diffs + player point impacts). */
    audit?: SyncAuditTrail;
    /** Bonus kinds that were auto-resolved this run. */
    autoResolved?: string[];
}

function describeError(e: unknown): string {
    if (e instanceof Error) {
        const name = e.name !== "Error" ? `${e.name}: ` : "";
        const stackHead = e.stack
            ?.split("\n")
            .slice(0, 3)
            .join(" | ")
            .replace(/\s+/g, " ")
            .trim();
        return `${name}${e.message}${stackHead !== undefined ? ` (${stackHead})` : ""}`;
    }
    return String(e);
}

export { SyncRegressionError } from "@/lib/sync-integrity";

export interface SyncOptions {
    /** When true, a point regression throws SyncRegressionError and rolls back.
     *  When false, regressions are logged but the sync commits anyway.
     *  Default: false (cron behaviour — never silently stuck). */
    blockOnRegression?: boolean;
}

export async function syncResultsFromFootballData(
    actor: string,
    opts: SyncOptions = {},
): Promise<SyncResult> {
    const startedAt = Date.now();
    let teamCount = 0;
    let matchCount = 0;
    const matchStatusCounts: Record<string, number> = {};
    const matchErrors: Array<{ externalId: number; message: string }> = [];
    const errors: string[] = [];
    let audit: SyncAuditTrail | undefined;

    const forceSync = process.env.SYNC_FORCE === "1";
    const blockOnRegression = opts.blockOnRegression ?? false;

    console.log(`[sync ${actor}] start${forceSync ? " (FORCE)" : ""}`);

    // --- Phase 1: Upsert teams ---
    try {
        const fdTeams = await fetchTeams();
        console.log(`[sync ${actor}] FD returned ${fdTeams.length} teams`);
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
        errors.push(`teams: ${describeError(e)}`);
    }

    // --- Phase 2: Pre-load team map (eliminates ~208 SELECTs) ---
    const allTeams = await db.select().from(teams);
    const teamByCode = new Map(allTeams.map((t) => [t.code, t]));

    // --- Phase 3: Capture pre-sync state for regression detection ---
    const preSnapshotInput = await loadSnapshotInput();
    const preState = computeSnapshotState(preSnapshotInput);

    // Capture pre-sync match state for the audit trail
    const home = await db.select().from(matches);
    const matchesBefore: MatchState[] = home.map((m) => {
        const homeT = allTeams.find((t) => t.id === m.homeTeamId);
        const awayT = allTeams.find((t) => t.id === m.awayTeamId);
        return {
            id: m.id,
            externalId: m.externalId,
            status: m.status,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            homeName: homeT?.name ?? null,
            awayName: awayT?.name ?? null,
        };
    });

    // --- Phase 4: Upsert matches inside a transaction ---
    try {
        const fdMatches = await fetchMatches();
        console.log(`[sync ${actor}] FD returned ${fdMatches.length} matches`);

        await db.transaction(async (tx) => {
            const groupByTeamId = new Map<number, string>();

            for (const m of fdMatches) {
                try {
                    const homeTeam = m.homeTeam.tla
                        ? teamByCode.get(m.homeTeam.tla)
                        : undefined;
                    const awayTeam = m.awayTeam.tla
                        ? teamByCode.get(m.awayTeam.tla)
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

                    const winnerTeamId =
                        m.score.winner === "HOME_TEAM"
                            ? (homeTeam?.id ?? null)
                            : m.score.winner === "AWAY_TEAM"
                              ? (awayTeam?.id ?? null)
                              : null;

                    const ftHome = m.score.fullTime.home;
                    const ftAway = m.score.fullTime.away;
                    const etHome = m.score.extraTime?.home ?? null;
                    const etAway = m.score.extraTime?.away ?? null;
                    const pensHome = m.score.penalties?.home ?? null;
                    const pensAway = m.score.penalties?.away ?? null;
                    const scoringHome = etHome ?? ftHome;
                    const scoringAway = etAway ?? ftAway;

                    const newKickoff = new Date(m.utcDate);
                    const firstLockedAt = new Date(newKickoff.getTime() - 15 * 60_000);

                    const existing = (
                        await tx
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

                    await tx
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
                                kickoff: sql`CASE WHEN ${matches.adminOverridden} THEN ${matches.kickoff} ELSE ${newKickoff.toISOString()} END`,
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
                    matchStatusCounts[status] = (matchStatusCounts[status] ?? 0) + 1;
                } catch (e) {
                    const message = describeError(e);
                    matchErrors.push({ externalId: m.id, message });
                    console.error(`[sync ${actor}] ✗ ext=${m.id} ${message}`);
                }
            }

            // Backfill teams.group_letter inside the same transaction
            for (const [teamId, groupLetter] of groupByTeamId) {
                await tx.update(teams).set({ groupLetter }).where(eq(teams.id, teamId));
            }

            // --- Phase 5: Regression detection (inside tx so we can rollback) ---
            const postSnapshotInput = await loadSnapshotInput(tx);
            const postState = computeSnapshotState(postSnapshotInput);

            const matchesAfter: MatchState[] = (
                await tx.select().from(matches)
            ).map((m) => {
                const homeT = allTeams.find((t) => t.id === m.homeTeamId);
                const awayT = allTeams.find((t) => t.id === m.awayTeamId);
                return {
                    id: m.id,
                    externalId: m.externalId,
                    status: m.status,
                    homeScore: m.homeScore,
                    awayScore: m.awayScore,
                    homeName: homeT?.name ?? null,
                    awayName: awayT?.name ?? null,
                };
            });

            const allPlayers = await tx.select().from(players);
            const displayNames = new Map(allPlayers.map((p) => [p.id, p.displayName]));

            audit = buildSyncAuditTrail(
                matchesBefore,
                matchesAfter,
                preState,
                postState,
                displayNames,
            );

            if (audit.hasRegression && !forceSync && blockOnRegression) {
                throw new SyncRegressionError(audit);
            }

            if (audit.hasRegression && !blockOnRegression) {
                console.warn(
                    `[sync ${actor}] ⚠️ REGRESSION detected but committing (non-blocking mode): ` +
                        audit.regressions.map((r) => `${r.displayName} ${r.pointsDelta}`).join(", "),
                );
            }

            console.log(
                `[sync ${actor}] match upserts complete: ${matchCount} matches, ` +
                    `${audit.matchDiffs.length} diffs, ` +
                    `${audit.regressions.length} regressions${forceSync && audit.hasRegression ? " (FORCED)" : ""}`,
            );
        });
    } catch (e) {
        if (e instanceof SyncRegressionError) {
            const durationMs = Date.now() - startedAt;
            await db.insert(auditLog).values({
                actor,
                action: "sync-blocked-regression",
                detail: JSON.stringify({
                    regressions: e.audit.regressions,
                    matchDiffs: e.audit.matchDiffs,
                    playerImpacts: e.audit.playerImpacts,
                    durationMs,
                }),
            });
            throw e;
        }
        errors.push(`matches: ${describeError(e)}`);
    }

    const durationMs = Date.now() - startedAt;

    console.log(
        `[sync ${actor}] done teams=${teamCount} matches=${matchCount} ` +
            `status=${JSON.stringify(matchStatusCounts)} ` +
            `errors=${errors.length}+${matchErrors.length} duration=${durationMs}ms`,
    );

    await db.insert(auditLog).values({
        actor,
        action: "sync-results",
        detail: JSON.stringify({
            teamCount,
            matchCount,
            matchStatusCounts,
            matchErrors,
            errors,
            durationMs,
            regressionDetected: audit?.hasRegression ?? false,
            audit: audit !== undefined
                ? {
                      matchDiffs: audit.matchDiffs,
                      regressions: audit.regressions,
                      playerImpacts: audit.playerImpacts,
                  }
                : undefined,
        }),
    });

    // Capture leaderboard snapshots for the chart + ▲/▼ indicators. Runs
    // after the score upserts so it sees the freshest data; failures are
    // swallowed into auditLog so a snapshot bug never blocks the actual
    // score sync. Gap detection on the next run replays anything missed.
    await runSnapshotPipelineQuietly(actor);

    // Auto-resolve bonuses whose conditions are now met (e.g. group-stage
    // bonuses once R32 starts, tournament-end bonuses once FINAL finishes).
    // Failures are logged but never block the sync.
    let autoResolved: string[] = [];
    try {
        autoResolved = await autoResolveBonuses(actor);
        if (autoResolved.length > 0) {
            console.log(`[sync ${actor}] auto-resolved bonuses: ${autoResolved.join(", ")}`);
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[sync ${actor}] auto-resolve-bonuses failed: ${message}`);
        await db.insert(auditLog).values({
            actor,
            action: "auto-resolve-bonuses-error",
            detail: JSON.stringify({ error: message }),
        });
    }

    // Bust the live-leaders cache so /bonuses + /stats reflect the new data
    // on next request, instead of serving the stale 5-min snapshot.
    try {
        revalidateTag("live-leaders");
    } catch {
        // revalidateTag throws when called outside a request scope (e.g. seed
        // scripts). Cron and admin actions both run in a request, so this
        // catch is just defensive against future callers.
    }

    return {
        teamCount,
        matchCount,
        matchStatusCounts,
        matchErrors,
        errors,
        durationMs,
        actor,
        audit,
        autoResolved,
    };
}
