import { type NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { syncResultsFromFootballData } from "@/lib/sync";
import { sendPickReminders } from "@/lib/reminders";
import { db } from "@/db/client";
import { auditLog } from "@/db/schema";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

function safeBearerEqual(header: string | null, secret: string): boolean {
    if (header === null) {
        return false;
    }
    const expected = `Bearer ${secret}`;
    if (header.length !== expected.length) {
        return false;
    }
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
    if (!safeBearerEqual(request.headers.get("authorization"), env.CRON_SECRET)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const sync = await syncResultsFromFootballData("cron");
    const reminders = await sendPickReminders();
    await db.insert(auditLog).values({
        actor: "cron",
        action: "send-reminders",
        detail: JSON.stringify(reminders),
    });
    // Bust ISR snapshots for pages that surface match scores / standings.
    // Mirrors triggerSyncAction so the cron and the admin button behave the
    // same way — without this, /leaderboard's revalidate=30 snapshot can
    // serve a pre-sync view for up to 30s.
    revalidatePath("/leaderboard");
    revalidatePath("/today");
    revalidatePath("/predictions");
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/matches");
    return NextResponse.json({ sync, reminders });
}
