import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, matches } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { syncResultsFromFootballData } from "@/lib/sync";

export const dynamic = "force-dynamic";

const COOLDOWN_MS = 2 * 60_000;

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

    if (msSinceSync > COOLDOWN_MS) {
        try {
            await syncResultsFromFootballData("auto-sync");
            didSync = true;
            revalidatePath("/leaderboard");
            revalidatePath("/today");
            revalidatePath("/predictions");
        } catch {
            // Swallow — auto-sync should never break the client
        }
    }

    const [freshSync] = await db
        .select({ at: auditLog.at })
        .from(auditLog)
        .where(eq(auditLog.action, "sync-results"))
        .orderBy(desc(auditLog.id))
        .limit(1);

    const hasLive = await db
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.status, "LIVE"))
        .limit(1);

    return NextResponse.json({
        didSync,
        lastSyncAt: freshSync?.at?.toISOString() ?? null,
        hasLiveMatches: hasLive.length > 0,
    });
}
