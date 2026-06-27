"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { syncResultsFromFootballData, SyncRegressionError } from "@/lib/sync";

export interface SyncResult {
    ok: boolean;
    error?: string;
    matchCount?: number;
    regressionBlocked?: boolean;
}

export async function refreshDataAction(): Promise<SyncResult> {
    await requireSession();
    try {
        const result = await syncResultsFromFootballData("player-refresh", {
            blockOnRegression: true,
        });
        revalidatePath("/leaderboard");
        revalidatePath("/today");
        revalidatePath("/predictions");
        return {
            ok: true,
            matchCount: result.matchCount,
        };
    } catch (e) {
        if (e instanceof SyncRegressionError) {
            return {
                ok: false,
                error: "Sync detected a data issue — admin has been notified.",
                regressionBlocked: true,
            };
        }
        return { ok: false, error: (e as Error).message };
    }
}
