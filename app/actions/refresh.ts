"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { syncResultsFromFootballData } from "@/lib/sync";

export interface SyncResult {
    ok: boolean;
    error?: string;
    matchCount?: number;
}

export async function refreshDataAction(): Promise<SyncResult> {
    await requireSession();
    try {
        const result = await syncResultsFromFootballData("player-refresh");
        revalidatePath("/leaderboard");
        revalidatePath("/today");
        revalidatePath("/predictions");
        return {
            ok: true,
            matchCount: result.matchCount,
        };
    } catch (e) {
        return { ok: false, error: (e as Error).message };
    }
}
