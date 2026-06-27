import { type NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { syncResultsFromFootballData, SyncRegressionError } from "@/lib/sync";
import { sendPickReminders } from "@/lib/reminders";
import { db } from "@/db/client";
import { auditLog } from "@/db/schema";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

function safeStringEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isAuthorized(request: NextRequest, secret: string): boolean {
    const header = request.headers.get("authorization");
    if (header !== null && safeStringEqual(header, `Bearer ${secret}`)) {
        return true;
    }
    const querySecret = request.nextUrl.searchParams.get("secret");
    if (querySecret !== null && safeStringEqual(querySecret, secret)) {
        return true;
    }
    return false;
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request, env.CRON_SECRET)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    // Vercel cron requests carry this header; everything else is a manual run
    // (Shortcut, browser, curl) and is recorded under a distinct actor so the
    // audit log can distinguish scheduled syncs from on-demand ones.
    const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron") ?? false;
    const actor = isVercelCron ? "cron" : "manual-cron";

    let sync;
    try {
        sync = await syncResultsFromFootballData(actor);
    } catch (e) {
        if (e instanceof SyncRegressionError) {
            return NextResponse.json(
                {
                    error: "regression_detected",
                    message: e.message,
                    regressions: e.audit.regressions,
                    matchDiffs: e.audit.matchDiffs,
                },
                { status: 409 },
            );
        }
        throw e;
    }

    const reminders = await sendPickReminders();
    await db.insert(auditLog).values({
        actor,
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
