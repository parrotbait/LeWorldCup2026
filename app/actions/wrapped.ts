"use server";

import { requireSession } from "@/lib/auth";
import { markWrappedSeen } from "@/lib/wrapped-store";

/** Persist the cross-device auto-open-once flag for the current player. */
export async function markWrappedSeenAction(): Promise<void> {
    const session = await requireSession();
    await markWrappedSeen(session.playerId);
}
