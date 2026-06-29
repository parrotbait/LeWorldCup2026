import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, matches } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { syncResultsFromFootballData } from "@/lib/sync";
import { fetchMatchMinutes, type LiveMinuteInfo } from "@/lib/football-data";

export const dynamic = "force-dynamic";

const COOLDOWN_MS = 2 * 60_000;
const MINUTES_CACHE_TTL_MS = 60_000;

let cachedMinutes: LiveMinuteInfo[] = [];
let minutesCachedAt = 0;

export async function GET() {
    await requireSession();

    const [lastSync] = await db
        .select({ at: auditLog.at })
        .from(auditLog)
        .where(eq(auditLog.action, "sync-results"))
        .orderBy(desc(auditLog.id))
        .limit(1);

    const lastSyncAt = lastSync?.at ?? null;
    const msSinceSync = lastSyncAt !== null
        ? Date.now() - lastSyncAt.getTime()
        : Infinity;

    let didSync = false;
    let liveMinutes: LiveMinuteInfo[] = [];

    if (msSinceSync > COOLDOWN_MS) {
        try {
            const result = await syncResultsFromFootballData("auto-sync");
            didSync = true;
            revalidatePath("/leaderboard");
            revalidatePath("/today");
            revalidatePath("/predictions");

            // Reuse the sync's match data for minutes — avoid a redundant API call.
            // The sync already fetched /matches; extract minute info from DB state.
            liveMinutes = result.liveMinutes ?? [];
            cachedMinutes = liveMinutes;
            minutesCachedAt = Date.now();
        } catch {
            // Swallow — auto-sync should never break the client
        }
    }

    // If we didn't sync (or sync failed), serve cached minutes or fetch fresh
    if (!didSync) {
        const hasLiveMatches = await db
            .select({ id: matches.id })
            .from(matches)
            .where(eq(matches.status, "LIVE"))
            .limit(1);

        if (hasLiveMatches.length > 0) {
            const cacheAge = Date.now() - minutesCachedAt;
            if (cacheAge < MINUTES_CACHE_TTL_MS && cachedMinutes.length > 0) {
                liveMinutes = cachedMinutes;
            } else {
                try {
                    liveMinutes = await fetchMatchMinutes();
                    cachedMinutes = liveMinutes;
                    minutesCachedAt = Date.now();
                } catch {
                    liveMinutes = cachedMinutes;
                }
            }
        }
    }

    return NextResponse.json({
        didSync,
        lastSyncAt: lastSyncAt?.toISOString() ?? null,
        liveMinutes,
    });
}
