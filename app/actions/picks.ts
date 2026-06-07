"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { bonusPicks, jokers, matches, predictions, settings, teams, auditLog } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { pickLockTime } from "@/lib/utils";
import { getTournamentLockState } from "@/lib/tournament-lock";
import { findPlayer } from "@/lib/players";

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
    if (match.homeTeamId === null || match.awayTeamId === null) {
        return { ok: false, error: "Teams not known yet — this fixture is TBD" };
    }
    if (
        pickLockTime(match.kickoff) <= Date.now() ||
        (match.firstLockedAt !== null && match.firstLockedAt.getTime() <= Date.now()) ||
        match.status !== "SCHEDULED"
    ) {
        return { ok: false, error: "Picks for this match are locked" };
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

    // Audit-log every prediction save. Disputes ("I filed a pick, why's
    // it not counted?") need a record we can point at.
    await db.insert(auditLog).values({
        actor: `player:${session.playerId}`,
        action: "save-prediction",
        detail: JSON.stringify({ matchId, homeScore, awayScore }),
    });

    revalidatePath("/predictions");
    revalidatePath("/leaderboard");
    revalidatePath(`/matches/${matchId}`);
    return { ok: true };
}

// ---------------------------------------------------------------------------
// Bonus picks
// ---------------------------------------------------------------------------

// GROUP_WINNER is deliberately omitted: cut from the v1 picks UI per
// docs/game-design.md §2.3. The DB enum and scoring engine retain support
// for it so historical/sim data still computes correctly.
const bonusKindSchema = z.enum([
    "WINNER",
    "TOP_SCORER",
    "MOST_ASSISTS",
    "DARK_HORSE",
    "WOODEN_SPOON",
    "PANTOMIME_VILLAIN",
    "SIEVE",
    "MIGHTY_FALLEN",
]);

const saveBonusSchema = z.object({
    kind: bonusKindSchema,
    teamId: z.coerce.number().int().positive().optional().nullable(),
    playerName: z.string().trim().max(80).optional().nullable(),
});

async function tournamentLocked(): Promise<boolean> {
    return (await getTournamentLockState()).locked;
}

export async function saveBonusAction(formData: FormData): Promise<SaveResult> {
    const session = await requireSession();
    const parsed = saveBonusSchema.safeParse({
        kind: formData.get("kind"),
        teamId: formData.get("teamId"),
        playerName: formData.get("playerName"),
    });
    if (!parsed.success) {
        return { ok: false, error: "Invalid bonus pick" };
    }
    if (await tournamentLocked()) {
        return { ok: false, error: "Bonuses are locked — tournament has kicked off" };
    }
    const { kind, teamId, playerName } = parsed.data;

    if (
        (kind === "WINNER" ||
            kind === "DARK_HORSE" ||
            kind === "WOODEN_SPOON" ||
            kind === "PANTOMIME_VILLAIN" ||
            kind === "SIEVE" ||
            kind === "MIGHTY_FALLEN") &&
        (teamId === null || teamId === undefined)
    ) {
        return { ok: false, error: "Team required" };
    }
    if (
        kind === "TOP_SCORER" || kind === "MOST_ASSISTS"
    ) {
        if (playerName === null || playerName === undefined || playerName === "") {
            return { ok: false, error: "Player name required" };
        }
    }
    // Player-stat bonuses must resolve to a real player from the official
    // squad lists. We persist the canonical "LAST First" form so admin
    // resolution and /players profile pages render uniformly.
    let canonicalPlayerName: string | null = playerName ?? null;
    if (
        (kind === "TOP_SCORER" || kind === "MOST_ASSISTS") &&
        playerName !== null &&
        playerName !== undefined
    ) {
        const found = findPlayer(playerName);
        if (found === null) {
            return { ok: false, error: "Pick a player from the list" };
        }
        canonicalPlayerName = found.displayName;
    }

    // Pot-based eligibility for the team-bound bonuses. Defends against a
    // hand-crafted POST that bypasses the UI's pre-filtered pot lists:
    //   - DARK_HORSE: only teams NOT in pot 1.
    //   - MIGHTY_FALLEN: only teams in pot 1.
    // If the team has no pot set yet (data not loaded) we let it through —
    // pre-tournament we can't reliably reject.
    if ((kind === "DARK_HORSE" || kind === "MIGHTY_FALLEN") && teamId !== null && teamId !== undefined) {
        const team = (
            await db
                .select({ pot: teams.pot })
                .from(teams)
                .where(eq(teams.id, teamId))
                .limit(1)
        )[0];
        if (team !== undefined && team.pot !== null) {
            if (kind === "DARK_HORSE" && team.pot === 1) {
                return { ok: false, error: "Dark horse must be a non-Pot-1 team" };
            }
            if (kind === "MIGHTY_FALLEN" && team.pot !== 1) {
                return { ok: false, error: "Mighty Fallen must be a Pot-1 team" };
            }
        }
    }

    await db
        .insert(bonusPicks)
        .values({
            playerId: session.playerId,
            kind,
            groupLetter: "",
            teamId: teamId ?? null,
            playerName: canonicalPlayerName,
        })
        .onConflictDoUpdate({
            target: [bonusPicks.playerId, bonusPicks.kind, bonusPicks.groupLetter],
            set: {
                teamId: teamId ?? null,
                playerName: canonicalPlayerName,
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

// Joker is only offered up to QF — see /joker page for rationale.
const roundSchema = z.enum(["R32", "R16", "QF"]);

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
    // Round locks 15 min before the first kickoff of that round — same
    // moment predictions for that match start revealing publicly.
    // POSTPONED/CANCELLED matches are skipped so a delayed earliest match
    // doesn't strand the rest of the round.
    const earliestRoundMatch = (
        await db
            .select({ kickoff: matches.kickoff })
            .from(matches)
            .where(
                and(
                    eq(matches.round, round),
                    inArray(matches.status, ["SCHEDULED", "LIVE", "FINISHED"]),
                ),
            )
            .orderBy(matches.kickoff)
            .limit(1)
    )[0];
    if (
        earliestRoundMatch !== undefined &&
        pickLockTime(earliestRoundMatch.kickoff) <= Date.now()
    ) {
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
                eq(bonusPicks.groupLetter, groupLetter ?? ""),
            ),
        );
    revalidatePath("/bonuses");
    return { ok: true };
}
