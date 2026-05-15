"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { players } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { env } from "@/lib/env";
import {
    clearAdminCookie,
    clearSessionCookie,
    setAdminCookie,
    setSessionCookie,
} from "@/lib/auth";

const joinSchema = z.object({
    inviteCode: z.string().trim().min(1),
    displayName: z
        .string()
        .trim()
        .min(2, "At least 2 characters")
        .max(24, "At most 24 characters"),
});

export interface ActionResult {
    error?: string;
}

export async function joinAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
    const parsed = joinSchema.safeParse({
        inviteCode: formData.get("inviteCode"),
        displayName: formData.get("displayName"),
    });
    if (!parsed.success) {
        return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    const { inviteCode, displayName } = parsed.data;

    if (inviteCode !== env.INVITE_CODE) {
        return { error: "Invite code is wrong. Ask the admin." };
    }

    // Reserve display name (idempotent — return existing player if matched).
    const existing = await db.select().from(players).where(eq(players.displayName, displayName)).limit(1);
    let player = existing[0];
    if (player === undefined) {
        const inserted = await db
            .insert(players)
            .values({ displayName })
            .returning();
        player = inserted[0]!;
    }

    await setSessionCookie({ playerId: player.id, displayName: player.displayName });
    redirect("/leaderboard");
}

export async function logoutAction(): Promise<void> {
    await clearSessionCookie();
    redirect("/");
}

const adminLoginSchema = z.object({
    password: z.string().min(1),
});

export async function adminLoginAction(
    _prev: ActionResult | undefined,
    formData: FormData,
): Promise<ActionResult> {
    const parsed = adminLoginSchema.safeParse({ password: formData.get("password") });
    if (!parsed.success) {
        return { error: "Password required" };
    }
    const ok = await verifyPassword(parsed.data.password, env.ADMIN_PASSWORD_HASH);
    if (!ok) {
        return { error: "Wrong password" };
    }
    await setAdminCookie();
    redirect("/admin/dashboard");
}

export async function adminLogoutAction(): Promise<void> {
    await clearAdminCookie();
    redirect("/admin");
}
