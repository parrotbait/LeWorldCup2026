/**
 * Auto-resolve bonus winners after each sync.
 *
 * Group-stage bonuses (WOODEN_SPOON, MIGHTY_FALLEN) resolve once R32 has
 * started. Tournament-end bonuses (WINNER, TOP_SCORER, MOST_ASSISTS, SIEVE)
 * resolve once the FINAL is FINISHED. PANTOMIME_VILLAIN requires card data
 * unavailable in the free tier — left for admin.
 *
 * Idempotent: skips writing when the computed value matches the existing row.
 */

import { and, eq } from "drizzle-orm";
import { db as dbInstance } from "@/db/client";
import { auditLog, bonusResolutions, matches, teams } from "@/db/schema";
import { sortWoodenSpoonCandidates } from "@/lib/live-leaders-pure";
import { fetchTopAssists, fetchTopGoals } from "@/lib/espn-stats";
import { findPlayer } from "@/lib/players";
import {
    computeSnapshotState,
    fetchMostRecentSnapshotState,
    loadSnapshotInput,
    writeSnapshot,
} from "@/lib/snapshot";

type DB = typeof dbInstance;

const ROUND_RANK: Record<string, number> = {
    GROUP: 0,
    R32: 1,
    R16: 2,
    QF: 3,
    SF: 4,
    THIRD: 5,
    FINAL: 6,
};

interface TeamProgress {
    id: number;
    code: string;
    name: string;
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

interface Resolution {
    kind: string;
    teamIds: number[];
    playerNames: string[];
}

async function upsertResolution(
    db: DB,
    resolution: Resolution,
    actor: string,
): Promise<boolean> {
    const { kind, teamIds, playerNames } = resolution;
    const groupLetter = "";

    // Sort arrays for stable comparison — avoids phantom "changed" writes
    // when tied teams/players come back in a different order between syncs.
    const sortedTeamIds = [...teamIds].sort((a, b) => a - b);
    const sortedPlayerNames = [...playerNames].sort((a, b) => a.localeCompare(b));

    let changed = false;

    await db.transaction(async (tx) => {
        const [existing] = await tx
            .select({
                teamIds: bonusResolutions.teamIds,
                playerNames: bonusResolutions.playerNames,
            })
            .from(bonusResolutions)
            .where(
                and(
                    eq(bonusResolutions.kind, kind as never),
                    eq(bonusResolutions.groupLetter, groupLetter),
                ),
            );

        const sameTeamIds =
            existing !== undefined &&
            existing.teamIds.length === sortedTeamIds.length &&
            [...existing.teamIds].sort((a, b) => a - b).every((v, i) => v === sortedTeamIds[i]);
        const sameNames =
            existing !== undefined &&
            existing.playerNames.length === sortedPlayerNames.length &&
            [...existing.playerNames].sort((a, b) => a.localeCompare(b)).every((v, i) => v === sortedPlayerNames[i]);

        if (existing !== undefined && sameTeamIds && sameNames) {
            return;
        }

        changed = true;

        await tx
            .insert(bonusResolutions)
            .values({
                kind: kind as never,
                groupLetter,
                teamIds: sortedTeamIds,
                playerNames: sortedPlayerNames,
            })
            .onConflictDoUpdate({
                target: [bonusResolutions.kind, bonusResolutions.groupLetter],
                set: {
                    teamIds: sortedTeamIds,
                    playerNames: sortedPlayerNames,
                    updatedAt: new Date(),
                },
            });

        const input = await loadSnapshotInput(tx);
        const state = computeSnapshotState(input);
        const prior = await fetchMostRecentSnapshotState(tx);
        await writeSnapshot({
            capturedAt: new Date(),
            causeKind: "BONUS",
            causeMatchId: null,
            causeBonusKind: kind,
            state,
            priorState: prior?.state ?? null,
            tx,
        });

        await tx.insert(auditLog).values({
            actor,
            action: "auto-resolve-bonus",
            detail: JSON.stringify({ kind, teamIds: sortedTeamIds, playerNames: sortedPlayerNames }),
        });
    });

    return changed;
}

export async function autoResolveBonuses(
    actor: string,
    db: DB = dbInstance,
): Promise<string[]> {
    const resolved: string[] = [];
    const progress = await loadTeamProgress(db);

    const r32Played = progress.some((t) => t.furthestRoundRank >= ROUND_RANK.R32);
    const finalRow = await db
        .select({ status: matches.status, winnerTeamId: matches.winnerTeamId })
        .from(matches)
        .where(eq(matches.round, "FINAL"))
        .limit(1);
    const tournamentComplete =
        finalRow[0] !== undefined && finalRow[0].status === "FINISHED";

    // --- Group-stage bonuses (resolve once R32 has been played) ---

    if (r32Played) {
        // WOODEN_SPOON: worst record among teams eliminated in groups
        const eliminated = progress.filter((t) => t.furthestRoundRank < ROUND_RANK.R32);
        if (eliminated.length > 0) {
            const sorted = sortWoodenSpoonCandidates(eliminated);
            const worst = sorted[0]!;
            const tied = sorted.filter((t) => {
                const gdT = t.goalsFor - t.goalsAgainst;
                const gdW = worst.goalsFor - worst.goalsAgainst;
                return t.points === worst.points && gdT === gdW && t.goalsFor === worst.goalsFor;
            });
            const changed = await upsertResolution(db, {
                kind: "WOODEN_SPOON",
                teamIds: tied.map((t) => t.id),
                playerNames: [],
            }, actor);
            if (changed) {
                resolved.push("WOODEN_SPOON");
            }
        }

        // MIGHTY_FALLEN: Pot-1 teams eliminated in groups
        const pot1Eliminated = progress.filter(
            (t) => t.pot === 1 && t.furthestRoundRank < ROUND_RANK.R32,
        );
        // Resolve even if empty — an empty array means "no pot-1 team fell"
        const changed = await upsertResolution(db, {
            kind: "MIGHTY_FALLEN",
            teamIds: pot1Eliminated.map((t) => t.id),
            playerNames: [],
        }, actor);
        if (changed) {
            resolved.push("MIGHTY_FALLEN");
        }
    }

    // --- Tournament-end bonuses (resolve once FINAL is FINISHED) ---

    if (tournamentComplete) {
        // WINNER
        const winnerId = finalRow[0]!.winnerTeamId;
        if (winnerId !== null && winnerId !== undefined) {
            const changed = await upsertResolution(db, {
                kind: "WINNER",
                teamIds: [winnerId],
                playerNames: [],
            }, actor);
            if (changed) {
                resolved.push("WINNER");
            }
        }

        // SIEVE: most goals conceded across the entire tournament
        const maxConceded = Math.max(...progress.map((t) => t.goalsAgainst));
        if (maxConceded > 0) {
            const sieveTeams = progress.filter((t) => t.goalsAgainst === maxConceded);
            const changed = await upsertResolution(db, {
                kind: "SIEVE",
                teamIds: sieveTeams.map((t) => t.id),
                playerNames: [],
            }, actor);
            if (changed) {
                resolved.push("SIEVE");
            }
        }

        // TOP_SCORER and MOST_ASSISTS from ESPN (single source of truth,
        // matches what the /stats page shows). football-data /scorers is
        // no longer consulted — it disagreed with ESPN on both goals and
        // assists at the free tier and produced resolutions that named
        // different players than the Stats page.
        try {
            const goalLeaders = await fetchTopGoals();
            if (goalLeaders !== null && goalLeaders.length > 0) {
                const maxGoals = Math.max(...goalLeaders.map((g) => g.goals));
                if (maxGoals > 0) {
                    const topScorers = goalLeaders.filter((g) => g.goals === maxGoals);
                    const names = topScorers.map((g) => {
                        const canonical = findPlayer(g.playerName);
                        return canonical?.displayName ?? g.playerName;
                    });
                    const changed = await upsertResolution(db, {
                        kind: "TOP_SCORER",
                        teamIds: [],
                        playerNames: names,
                    }, actor);
                    if (changed) {
                        resolved.push("TOP_SCORER");
                    }
                }
            }
        } catch {
            // ESPN goals fetch failure shouldn't block the rest of sync.
        }

        try {
            const assistLeaders = await fetchTopAssists();
            if (assistLeaders !== null && assistLeaders.length > 0) {
                const maxAssists = Math.max(...assistLeaders.map((a) => a.assists));
                if (maxAssists > 0) {
                    const topAssisters = assistLeaders.filter((a) => a.assists === maxAssists);
                    const names = topAssisters.map((a) => {
                        const canonical = findPlayer(a.playerName);
                        return canonical?.displayName ?? a.playerName;
                    });
                    const changed = await upsertResolution(db, {
                        kind: "MOST_ASSISTS",
                        teamIds: [],
                        playerNames: names,
                    }, actor);
                    if (changed) {
                        resolved.push("MOST_ASSISTS");
                    }
                }
            }
        } catch {
            // ESPN assists fetch failure shouldn't block the rest of sync.
        }


        // PANTOMIME_VILLAIN is admin-only. We can't auto-resolve it: the
        // sitewebapi discipline endpoint doesn't exist, and the HTML stats
        // page sits behind AWS WAF (JavaScript challenge / gokuProps) which
        // ships a 2KB stub to server-side fetchers instead of the real page.
        // Admin resolves manually via /admin/bonuses using ESPN's discipline
        // table as reference. See the PANTOMIME_VILLAIN entry in the unlock
        // gate list in lib/wrapped.ts — Wrapped won't unlock until this is set.
    }

    return resolved;
}
