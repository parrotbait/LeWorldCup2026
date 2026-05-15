"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { auditLog, matches, settings } from "@/db/schema";
import { isAdmin } from "@/lib/auth";

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
    await db
        .update(matches)
        .set({ adminOverridden: false })
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
