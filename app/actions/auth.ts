"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { players } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import { env } from "@/lib/env";
import {
    clearAdminCookie,
    clearSessionCookie,
    setAdminCookie,
    setSessionCookie,
} from "@/lib/auth";

const PASSWORD_MIN = 6;

const signUpSchema = z.object({
    inviteCode: z.string().trim().min(1),
    displayName: z
        .string()
        .trim()
        .min(2, "At least 2 characters")
        .max(24, "At most 24 characters"),
    password: z
        .string()
        .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`),
});

const logInSchema = z.object({
    displayName: z.string().trim().min(1),
    password: z.string().min(1),
});

export interface ActionResult {
    error?: string;
}

export async function signUpAction(
    _prev: ActionResult | undefined,
    formData: FormData,
): Promise<ActionResult> {
    const parsed = signUpSchema.safeParse({
        inviteCode: formData.get("inviteCode"),
        displayName: formData.get("displayName"),
        password: formData.get("password"),
    });
    if (!parsed.success) {
        return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    const { inviteCode, displayName, password } = parsed.data;

    if (inviteCode !== env.INVITE_CODE) {
        return { error: "Invite code is wrong. Ask the admin." };
    }

    const existing = await db
        .select()
        .from(players)
        .where(eq(players.displayName, displayName))
        .limit(1);
    if (existing.length > 0) {
        return { error: "That name is already taken. Pick another, or log in if it's yours." };
    }

    const passwordHash = await hashPassword(password);
    const inserted = await db
        .insert(players)
        .values({ displayName, passwordHash })
        .returning();
    const player = inserted[0]!;

    await setSessionCookie({ playerId: player.id, displayName: player.displayName });
    redirect("/leaderboard");
}

export async function logInAction(
    _prev: ActionResult | undefined,
    formData: FormData,
): Promise<ActionResult> {
    const parsed = logInSchema.safeParse({
        displayName: formData.get("displayName"),
        password: formData.get("password"),
    });
    if (!parsed.success) {
        return { error: "Enter your name and password" };
    }
    const { displayName, password } = parsed.data;

    const found = await db
        .select()
        .from(players)
        .where(eq(players.displayName, displayName))
        .limit(1);
    const player = found[0];
    // Generic error for both "no such player" and "wrong password" — don't
    // leak which one it was.
    const generic = { error: "Name or password is wrong." };
    if (player === undefined || player.passwordHash === null) {
        return generic;
    }
    const ok = await verifyPassword(password, player.passwordHash);
    if (!ok) {
        return generic;
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
