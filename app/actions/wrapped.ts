"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { auditLog, playerWrapped } from "@/db/schema";
import { requireAdmin, requireSession } from "@/lib/auth";
import { markWrappedSeen } from "@/lib/wrapped-store";

/** Persist the cross-device auto-open-once flag for the current player. */
export async function markWrappedSeenAction(): Promise<void> {
    const session = await requireSession();
    await markWrappedSeen(session.playerId);
}

/**
 * Blow away every frozen Wrapped payload so the next open recomputes each
 * player's story from live data. Preserved for admins mid-tournament when
 * scores/bonuses shift and the sample cards on /admin/wrapped need to reflect
 * the change. Audit-logged; no seen_at retained (the table is truncated).
 * The public unlock gate still applies to non-admin viewers, so this is safe
 * to run before the tournament ends.
 */
export async function rebuildAllWrappedAction(): Promise<{ cleared: number }> {
    await requireAdmin();
    const cleared = await db.delete(playerWrapped).returning({ playerId: playerWrapped.playerId });
    await db.insert(auditLog).values({
        actor: "admin",
        action: "rebuild-all-wrapped",
        detail: JSON.stringify({ cleared: cleared.length }),
    });
    revalidatePath("/admin/wrapped");
    revalidatePath("/leaderboard");
    return { cleared: cleared.length };
}
