"use server";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { passwordResetTokens, players } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import { env, passwordResetEnabled } from "@/lib/env";
import { passwordResetEmail, sendEmail } from "@/lib/email";
import {
    clearAdminCookie,
    clearSessionCookie,
    setAdminCookie,
    setSessionCookie,
} from "@/lib/auth";

const PASSWORD_MIN = 6;
const RESET_TOKEN_TTL_MINUTES = 60;

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
    email: z
        .string()
        .trim()
        .toLowerCase()
        .email("Invalid email")
        .optional()
        .or(z.literal("").transform(() => undefined)),
});

const logInSchema = z.object({
    displayName: z.string().trim().min(1),
    password: z.string().min(1),
});

export interface ActionResult {
    error?: string;
    info?: string;
}

export async function signUpAction(
    _prev: ActionResult | undefined,
    formData: FormData,
): Promise<ActionResult> {
    const parsed = signUpSchema.safeParse({
        inviteCode: formData.get("inviteCode"),
        displayName: formData.get("displayName"),
        password: formData.get("password"),
        email: formData.get("email"),
    });
    if (!parsed.success) {
        return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
    }
    const { inviteCode, displayName, password, email } = parsed.data;

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
    if (email !== undefined) {
        const emailTaken = await db
            .select()
            .from(players)
            .where(eq(players.email, email))
            .limit(1);
        if (emailTaken.length > 0) {
            return { error: "That email is already in use." };
        }
    }

    const passwordHash = await hashPassword(password);
    const inserted = await db
        .insert(players)
        .values({ displayName, passwordHash, email: email ?? null })
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

// ---------------------------------------------------------------------------
// Password reset (email-driven, single-use, 1h TTL)
// ---------------------------------------------------------------------------

const requestResetSchema = z.object({
    email: z.string().trim().toLowerCase().email("Invalid email"),
});

const GENERIC_RESET_OK: ActionResult = {
    info: "If that email is registered, a reset link is on the way. Check spam if you don't see it.",
};

function hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
}

export async function requestPasswordResetAction(
    _prev: ActionResult | undefined,
    formData: FormData,
): Promise<ActionResult> {
    if (!passwordResetEnabled) {
        return {
            error: "Password reset isn't configured yet. Ask the admin to clear your account so you can sign up again.",
        };
    }
    const parsed = requestResetSchema.safeParse({ email: formData.get("email") });
    if (!parsed.success) {
        return { error: "Invalid email" };
    }
    const { email } = parsed.data;

    const found = await db.select().from(players).where(eq(players.email, email)).limit(1);
    const player = found[0];
    if (player === undefined) {
        // Don't leak existence.
        return GENERIC_RESET_OK;
    }

    // Invalidate any unused, non-expired tokens for this player so the inbox
    // never has more than one live link at a time.
    await db
        .update(passwordResetTokens)
        .set({ usedAt: sql`now()` })
        .where(
            and(
                eq(passwordResetTokens.playerId, player.id),
                isNull(passwordResetTokens.usedAt),
            ),
        );

    const raw = randomBytes(32).toString("hex");
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);

    await db.insert(passwordResetTokens).values({
        playerId: player.id,
        tokenHash,
        expiresAt,
    });

    const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset/${raw}`;
    const { subject, text, html } = passwordResetEmail({
        displayName: player.displayName,
        resetUrl,
        expiresMinutes: RESET_TOKEN_TTL_MINUTES,
    });
    await sendEmail({ to: email, subject, text, html });

    return GENERIC_RESET_OK;
}

const resetSchema = z.object({
    token: z.string().min(32),
    password: z
        .string()
        .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`),
});

export async function resetPasswordAction(
    _prev: ActionResult | undefined,
    formData: FormData,
): Promise<ActionResult> {
    const parsed = resetSchema.safeParse({
        token: formData.get("token"),
        password: formData.get("password"),
    });
    if (!parsed.success) {
        return { error: parsed.error.errors[0]?.message ?? "Invalid request" };
    }
    const tokenHash = hashToken(parsed.data.token);

    const tokenRow = (
        await db
            .select()
            .from(passwordResetTokens)
            .where(eq(passwordResetTokens.tokenHash, tokenHash))
            .limit(1)
    )[0];
    if (
        tokenRow === undefined ||
        tokenRow.usedAt !== null ||
        tokenRow.expiresAt.getTime() < Date.now()
    ) {
        return { error: "This reset link is invalid or has expired. Request a new one." };
    }

    const newHash = await hashPassword(parsed.data.password);
    await db
        .update(players)
        .set({ passwordHash: newHash })
        .where(eq(players.id, tokenRow.playerId));
    await db
        .update(passwordResetTokens)
        .set({ usedAt: sql`now()` })
        .where(eq(passwordResetTokens.id, tokenRow.id));

    redirect("/?reset=ok");
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
