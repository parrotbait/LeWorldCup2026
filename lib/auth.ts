import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { players } from "@/db/schema";
import { env } from "./env";

const COOKIE_NAME = "lwc_session";
const ADMIN_COOKIE_NAME = "lwc_admin";

const secret = new TextEncoder().encode(env.AUTH_SECRET);

export interface SessionPayload {
    playerId: number;
    displayName: string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
    return await new SignJWT({ ...payload })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("60d")
        .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, secret);
        if (typeof payload.playerId !== "number" || typeof payload.displayName !== "string") {
            return null;
        }
        return { playerId: payload.playerId, displayName: payload.displayName };
    } catch {
        return null;
    }
}

export async function getSession(): Promise<SessionPayload | null> {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (token === undefined) {
        return null;
    }
    const payload = await verifySession(token);
    if (payload === null) {
        return null;
    }
    // Belt-and-braces: confirm the player still exists. After a sim reset the
    // cookie can outlive the row, which leaves every server action FK-failing.
    // We can't mutate the cookie from a server component, so just return null —
    // the next server action (login, logout) will overwrite or clear it.
    const exists = await db
        .select({ id: players.id })
        .from(players)
        .where(eq(players.id, payload.playerId))
        .limit(1);
    if (exists.length === 0) {
        return null;
    }
    return payload;
}

export async function requireSession(): Promise<SessionPayload> {
    const session = await getSession();
    if (session === null) {
        redirect("/");
    }
    return session;
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
    const token = await signSession(payload);
    const jar = await cookies();
    jar.set(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 60,
    });
}

export async function clearSessionCookie(): Promise<void> {
    const jar = await cookies();
    jar.delete(COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// Admin (separate cookie, separate password)
// ---------------------------------------------------------------------------

export async function signAdminCookie(): Promise<string> {
    return await new SignJWT({ admin: true })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(secret);
}

export async function isAdmin(): Promise<boolean> {
    const jar = await cookies();
    const token = jar.get(ADMIN_COOKIE_NAME)?.value;
    if (token === undefined) {
        return false;
    }
    try {
        const { payload } = await jwtVerify(token, secret);
        return payload.admin === true;
    } catch {
        return false;
    }
}

export async function requireAdmin(): Promise<void> {
    if (!(await isAdmin())) {
        redirect("/admin");
    }
}

export async function setAdminCookie(): Promise<void> {
    const token = await signAdminCookie();
    const jar = await cookies();
    jar.set(ADMIN_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
    });
}

export async function clearAdminCookie(): Promise<void> {
    const jar = await cookies();
    jar.delete(ADMIN_COOKIE_NAME);
}

export const constants = {
    COOKIE_NAME,
    ADMIN_COOKIE_NAME,
};
