"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { auditLog, bonusPicks, bonusResolutions, matches, players, settings } from "@/db/schema";
import { isAdmin } from "@/lib/auth";
import { findPlayer } from "@/lib/players";
import {
    computeSnapshotState,
    fetchMostRecentSnapshotState,
    loadSnapshotInput,
    writeSnapshot,
} from "@/lib/snapshot";
import { syncResultsFromFootballData } from "@/lib/sync";

async function ensureAdmin(): Promise<void> {
    if (!(await isAdmin())) {
        throw new Error("Forbidden");
    }
}

const overrideScoreSchema = z.object({
    matchId: z.coerce.number().int().positive(),
    homeScore: z.coerce.number().int().min(0).max(20),
    awayScore: z.coerce.number().int().min(0).max(20),
});

export interface AdminResult {
    ok: boolean;
    error?: string;
}

/**
 * Override a match score and mark the row so the cron sync won't clobber it.
 *
 * Recompute is implicit: the leaderboard is derived purely from match scores
 * and predictions on every read, so changing the score immediately reflects
 * everywhere.
 */
export async function overrideScoreAction(formData: FormData): Promise<AdminResult> {
    await ensureAdmin();
    const parsed = overrideScoreSchema.safeParse({
        matchId: formData.get("matchId"),
        homeScore: formData.get("homeScore"),
        awayScore: formData.get("awayScore"),
    });
    if (!parsed.success) {
        return { ok: false, error: "Invalid score" };
    }
    const { matchId, homeScore, awayScore } = parsed.data;

    await db
        .update(matches)
        .set({
            homeScore,
            awayScore,
            status: "FINISHED",
            adminOverridden: true,
        })
        .where(eq(matches.id, matchId));

    await db.insert(auditLog).values({
        actor: "admin",
        action: "override-score",
        detail: JSON.stringify({ matchId, homeScore, awayScore }),
    });

    revalidatePath("/leaderboard");
    revalidatePath("/matches");
    revalidatePath(`/matches/${matchId}`);
    revalidatePath("/admin/dashboard");
    return { ok: true };
}

export async function clearOverrideAction(matchId: number): Promise<AdminResult> {
    await ensureAdmin();
    // Null the score columns too — leaving the typed score in place after the
    // flag is cleared causes silent stale data on the next cron pass (the
    // adminOverridden CASE clauses no longer fire, but the values that were
    // there came from admin input). The next cron sync will populate them
    // canonically from football-data.
    await db
        .update(matches)
        .set({
            adminOverridden: false,
            homeScore: null,
            awayScore: null,
            homeScoreFt: null,
            awayScoreFt: null,
            homeScorePens: null,
            awayScorePens: null,
            winnerTeamId: null,
        })
        .where(eq(matches.id, matchId));
    await db.insert(auditLog).values({
        actor: "admin",
        action: "clear-override",
        detail: JSON.stringify({ matchId }),
    });
    revalidatePath("/admin/matches");
    return { ok: true };
}

const setKickoffSchema = z.object({
    iso: z.string().datetime(),
});

export async function setTournamentKickoffAction(formData: FormData): Promise<AdminResult> {
    await ensureAdmin();
    const parsed = setKickoffSchema.safeParse({ iso: formData.get("iso") });
    if (!parsed.success) {
        return { ok: false, error: "Invalid timestamp (ISO 8601 expected)" };
    }
    await db
        .insert(settings)
        .values({ id: 1, tournamentKickoff: new Date(parsed.data.iso) })
        .onConflictDoUpdate({
            target: settings.id,
            set: { tournamentKickoff: new Date(parsed.data.iso) },
        });
    await db.insert(auditLog).values({
        actor: "admin",
        action: "set-tournament-kickoff",
        detail: parsed.data.iso,
    });
    revalidatePath("/bonuses");
    return { ok: true };
}

// ---------------------------------------------------------------------------
// Bonus resolutions — admin sets the resolved value(s) per bonus kind so
// computeBonusPointsByPlayer can pay everyone out.
// ---------------------------------------------------------------------------

const bonusKindSchema = z.enum([
    "WINNER",
    "TOP_SCORER",
    "MOST_ASSISTS",
    "GROUP_WINNER",
    "DARK_HORSE",
    "WOODEN_SPOON",
    "PANTOMIME_VILLAIN",
    "SIEVE",
    "MIGHTY_FALLEN",
]);

function parseTeamIdList(raw: string | null): number[] {
    if (raw === null || raw.trim().length === 0) {
        return [];
    }
    return raw
        .split(/[,\s]+/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
}

function parsePlayerNameList(raw: string | null): string[] {
    if (raw === null || raw.trim().length === 0) {
        return [];
    }
    return raw
        .split(/\s*,\s*/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

export async function saveBonusResolutionAction(formData: FormData): Promise<AdminResult> {
    await ensureAdmin();
    const kind = bonusKindSchema.safeParse(formData.get("kind"));
    if (!kind.success) {
        return { ok: false, error: "Invalid bonus kind" };
    }
    const groupLetter = (formData.get("groupLetter") as string | null) ?? "";
    const teamIds = parseTeamIdList(formData.get("teamIds") as string | null);
    const rawNames = parsePlayerNameList(formData.get("playerNames") as string | null);
    // Snap player names to canonical "LAST First" form. The chip multi-select
    // already only emits canonical names, but we re-validate to defend against
    // hand-crafted POSTs.
    let playerNames = rawNames;
    if (kind.data === "TOP_SCORER" || kind.data === "MOST_ASSISTS") {
        const canonical: string[] = [];
        for (const n of rawNames) {
            const found = findPlayer(n);
            if (found === null) {
                return { ok: false, error: `Unknown player: "${n}"` };
            }
            canonical.push(found.displayName);
        }
        playerNames = canonical;
    }

    try {
        await db.transaction(async (tx) => {
            // Read existing row first so we can decide whether the upsert
            // actually changed anything — unchanged saves shouldn't pollute the
            // chart with phantom BONUS snapshots.
            const [existing] = await tx
                .select({
                    teamIds: bonusResolutions.teamIds,
                    playerNames: bonusResolutions.playerNames,
                })
                .from(bonusResolutions)
                .where(
                    and(
                        eq(bonusResolutions.kind, kind.data),
                        eq(bonusResolutions.groupLetter, groupLetter),
                    ),
                );

            const sameTeamIds =
                existing !== undefined &&
                existing.teamIds.length === teamIds.length &&
                existing.teamIds.every((v, i) => v === teamIds[i]);
            const sameNames =
                existing !== undefined &&
                existing.playerNames.length === playerNames.length &&
                existing.playerNames.every((v, i) => v === playerNames[i]);
            const changed = !(existing !== undefined && sameTeamIds && sameNames);

            await tx
                .insert(bonusResolutions)
                .values({
                    kind: kind.data,
                    groupLetter,
                    teamIds,
                    playerNames,
                })
                .onConflictDoUpdate({
                    target: [bonusResolutions.kind, bonusResolutions.groupLetter],
                    set: {
                        teamIds,
                        playerNames,
                        updatedAt: new Date(),
                    },
                });

            if (changed) {
                // Snapshot inside the same transaction so a snapshot failure
                // rolls back the resolution upsert. The admin sees the error
                // and can retry — better than silently keeping a resolution
                // that has no corresponding chart point.
                const input = await loadSnapshotInput(tx);
                const state = computeSnapshotState(input);
                const prior = await fetchMostRecentSnapshotState(tx);
                await writeSnapshot({
                    capturedAt: new Date(),
                    causeKind: "BONUS",
                    causeMatchId: null,
                    causeBonusKind: kind.data,
                    state,
                    priorState: prior?.state ?? null,
                    tx,
                });
            }

            await tx.insert(auditLog).values({
                actor: "admin",
                action: "save-bonus-resolution",
                detail: JSON.stringify({
                    kind: kind.data,
                    groupLetter,
                    teamIds,
                    playerNames,
                    snapshotWritten: changed,
                }),
            });
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, error: `Failed to save: ${message}` };
    }

    revalidatePath("/admin/bonuses");
    revalidatePath("/leaderboard");
    revalidatePath("/me");
    return { ok: true };
}

export interface AdminSyncResult extends AdminResult {
    teamCount?: number;
    matchCount?: number;
    syncErrors?: string[];
}

export async function triggerSyncAction(): Promise<AdminSyncResult> {
    await ensureAdmin();
    try {
        const result = await syncResultsFromFootballData("admin");
        revalidatePath("/leaderboard");
        revalidatePath("/today");
        revalidatePath("/predictions");
        revalidatePath("/admin/dashboard");
        revalidatePath("/admin/matches");
        return {
            ok: true,
            teamCount: result.teamCount,
            matchCount: result.matchCount,
            syncErrors: result.errors,
        };
    } catch (e) {
        return { ok: false, error: (e as Error).message };
    }
}

const adminBonusSchema = z.object({
    playerId: z.coerce.number().int().positive(),
    kind: z.enum([
        "WINNER",
        "TOP_SCORER",
        "MOST_ASSISTS",
        "DARK_HORSE",
        "WOODEN_SPOON",
        "PANTOMIME_VILLAIN",
        "SIEVE",
        "MIGHTY_FALLEN",
    ]),
    groupLetter: z.string().optional().default(""),
    teamId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
    playerName: z.string().optional().or(z.literal("").transform(() => undefined)),
});

/**
 * Set a bonus pick on behalf of a player. Bypasses the tournament-kickoff
 * lock so admin can backfill bonuses for late joiners; every call is
 * audit-logged with the actor as "admin" and the target player ID.
 */
export async function adminSetBonusForPlayerAction(formData: FormData): Promise<AdminResult> {
    await ensureAdmin();
    const parsed = adminBonusSchema.safeParse({
        playerId: formData.get("playerId"),
        kind: formData.get("kind"),
        groupLetter: formData.get("groupLetter") ?? "",
        teamId: formData.get("teamId"),
        playerName: formData.get("playerName"),
    });
    if (!parsed.success) {
        return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    const { playerId, kind, groupLetter } = parsed.data;
    let { teamId, playerName } = parsed.data;

    const target = (
        await db.select({ id: players.id }).from(players).where(eq(players.id, playerId)).limit(1)
    )[0];
    if (target === undefined) {
        return { ok: false, error: "Player not found" };
    }

    if (kind === "TOP_SCORER" || kind === "MOST_ASSISTS") {
        if (playerName === undefined || playerName === "") {
            return { ok: false, error: `Player name required for ${kind}` };
        }
        const found = findPlayer(playerName);
        if (found === null) {
            return { ok: false, error: `Unknown player: "${playerName}"` };
        }
        playerName = found.displayName;
        teamId = undefined;
    } else {
        if (teamId === undefined) {
            return { ok: false, error: "Team required" };
        }
        playerName = undefined;
    }

    await db
        .insert(bonusPicks)
        .values({
            playerId,
            kind,
            groupLetter,
            teamId: teamId ?? null,
            playerName: playerName ?? null,
        })
        .onConflictDoUpdate({
            target: [bonusPicks.playerId, bonusPicks.kind, bonusPicks.groupLetter],
            set: {
                teamId: teamId ?? null,
                playerName: playerName ?? null,
                updatedAt: new Date(),
            },
        });

    await db.insert(auditLog).values({
        actor: "admin",
        action: "admin-set-bonus",
        detail: JSON.stringify({ playerId, kind, groupLetter, teamId: teamId ?? null, playerName: playerName ?? null }),
    });

    revalidatePath("/leaderboard");
    revalidatePath("/me");
    revalidatePath(`/players/${playerId}`);
    revalidatePath("/admin/dashboard");
    return { ok: true };
}
