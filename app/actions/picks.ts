"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { bonusPicks, jokers, matches, predictions, settings } from "@/db/schema";
import { requireSession } from "@/lib/auth";

const scoreSchema = z.coerce.number().int().min(0).max(20);

const saveScoreSchema = z.object({
    matchId: z.coerce.number().int().positive(),
    homeScore: scoreSchema,
    awayScore: scoreSchema,
});

export interface SaveResult {
    ok: boolean;
    error?: string;
}

/**
 * Save (insert or update) a single match prediction.
 *
 * Enforces the per-match lock: predictions cannot be modified once that
 * match's kickoff has passed.
 */
export async function savePredictionAction(formData: FormData): Promise<SaveResult> {
    const session = await requireSession();
    const parsed = saveScoreSchema.safeParse({
        matchId: formData.get("matchId"),
        homeScore: formData.get("homeScore"),
        awayScore: formData.get("awayScore"),
    });
    if (!parsed.success) {
        return { ok: false, error: "Invalid score" };
    }
    const { matchId, homeScore, awayScore } = parsed.data;

    const match = (await db.select().from(matches).where(eq(matches.id, matchId)).limit(1))[0];
    if (match === undefined) {
        return { ok: false, error: "Match not found" };
    }
    if (match.kickoff.getTime() <= Date.now()) {
        return { ok: false, error: "Match has kicked off — picks are locked" };
    }

    await db
        .insert(predictions)
        .values({
            playerId: session.playerId,
            matchId,
            homeScore,
            awayScore,
        })
        .onConflictDoUpdate({
            target: [predictions.playerId, predictions.matchId],
            set: {
                homeScore,
                awayScore,
                updatedAt: new Date(),
            },
        });

    revalidatePath("/predictions");
    revalidatePath("/leaderboard");
    revalidatePath(`/matches/${matchId}`);
    return { ok: true };
}

// ---------------------------------------------------------------------------
// Bonus picks
// ---------------------------------------------------------------------------

const bonusKindSchema = z.enum([
    "WINNER",
    "TOP_SCORER",
    "GROUP_WINNER",
    "DARK_HORSE",
    "WOODEN_SPOON",
    "FIRST_GOAL_SCORER",
]);

const saveBonusSchema = z.object({
    kind: bonusKindSchema,
    groupLetter: z.string().trim().max(2).optional().nullable(),
    teamId: z.coerce.number().int().positive().optional().nullable(),
    playerName: z.string().trim().max(80).optional().nullable(),
});

async function tournamentLocked(): Promise<boolean> {
    const row = (await db.select().from(settings).where(eq(settings.id, 1)).limit(1))[0];
    if (row === undefined) {
        return false;
    }
    return row.tournamentKickoff.getTime() <= Date.now();
}

export async function saveBonusAction(formData: FormData): Promise<SaveResult> {
    const session = await requireSession();
    const parsed = saveBonusSchema.safeParse({
        kind: formData.get("kind"),
        groupLetter: formData.get("groupLetter"),
        teamId: formData.get("teamId"),
        playerName: formData.get("playerName"),
    });
    if (!parsed.success) {
        return { ok: false, error: "Invalid bonus pick" };
    }
    if (await tournamentLocked()) {
        return { ok: false, error: "Bonuses are locked — tournament has kicked off" };
    }
    const { kind, groupLetter, teamId, playerName } = parsed.data;

    // Group winner picks must carry a group letter; team-based picks need teamId;
    // player-name picks need a name. The schema permits nulls so we validate here.
    if (kind === "GROUP_WINNER" && (groupLetter === null || groupLetter === undefined || groupLetter === "")) {
        return { ok: false, error: "Group letter required" };
    }
    if (
        (kind === "WINNER" || kind === "DARK_HORSE" || kind === "WOODEN_SPOON" || kind === "GROUP_WINNER") &&
        (teamId === null || teamId === undefined)
    ) {
        return { ok: false, error: "Team required" };
    }
    if (
        (kind === "TOP_SCORER" || kind === "FIRST_GOAL_SCORER") &&
        (playerName === null || playerName === undefined || playerName === "")
    ) {
        return { ok: false, error: "Player name required" };
    }

    const groupKey = kind === "GROUP_WINNER" ? (groupLetter ?? null) : null;

    await db
        .insert(bonusPicks)
        .values({
            playerId: session.playerId,
            kind,
            groupLetter: groupKey,
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

    revalidatePath("/bonuses");
    revalidatePath("/me");
    return { ok: true };
}

// ---------------------------------------------------------------------------
// Joker (one match per knockout round, doubles prediction points)
// ---------------------------------------------------------------------------

const roundSchema = z.enum(["R32", "R16", "QF", "SF", "THIRD", "FINAL"]);

const saveJokerSchema = z.object({
    round: roundSchema,
    matchId: z.coerce.number().int().positive(),
});

export async function saveJokerAction(formData: FormData): Promise<SaveResult> {
    const session = await requireSession();
    const parsed = saveJokerSchema.safeParse({
        round: formData.get("round"),
        matchId: formData.get("matchId"),
    });
    if (!parsed.success) {
        return { ok: false, error: "Invalid joker selection" };
    }
    const { round, matchId } = parsed.data;

    const match = (await db.select().from(matches).where(eq(matches.id, matchId)).limit(1))[0];
    if (match === undefined) {
        return { ok: false, error: "Match not found" };
    }
    if (match.round !== round) {
        return { ok: false, error: "Match is not in that round" };
    }
    // Round locks at the first kickoff of that round.
    const earliestRoundMatch = (
        await db
            .select({ kickoff: matches.kickoff })
            .from(matches)
            .where(eq(matches.round, round))
            .orderBy(matches.kickoff)
            .limit(1)
    )[0];
    if (earliestRoundMatch !== undefined && earliestRoundMatch.kickoff.getTime() <= Date.now()) {
        return { ok: false, error: "Round has started — joker is locked" };
    }

    await db
        .insert(jokers)
        .values({
            playerId: session.playerId,
            round,
            matchId,
        })
        .onConflictDoUpdate({
            target: [jokers.playerId, jokers.round],
            set: { matchId },
        });

    revalidatePath("/joker");
    revalidatePath("/me");
    revalidatePath("/leaderboard");
    return { ok: true };
}

export async function clearBonusAction(kind: string, groupLetter: string | null): Promise<SaveResult> {
    const session = await requireSession();
    if (await tournamentLocked()) {
        return { ok: false, error: "Bonuses are locked" };
    }
    const parsedKind = bonusKindSchema.safeParse(kind);
    if (!parsedKind.success) {
        return { ok: false, error: "Invalid kind" };
    }
    await db
        .delete(bonusPicks)
        .where(
            and(
                eq(bonusPicks.playerId, session.playerId),
                eq(bonusPicks.kind, parsedKind.data),
                groupLetter === null
                    ? eq(bonusPicks.groupLetter, null as unknown as string)
                    : eq(bonusPicks.groupLetter, groupLetter),
            ),
        );
    revalidatePath("/bonuses");
    return { ok: true };
}
