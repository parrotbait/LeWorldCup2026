/** Dev-only: build a player's Wrapped ignoring the unlock gate. Never used in prod. */
import type { WrappedData } from "@/lib/wrapped";
import { computeAllWrappedForPreview } from "@/lib/wrapped-store";

export async function buildWrappedForPreview(playerId: number): Promise<WrappedData | null> {
    if (process.env.NODE_ENV === "production") {
        return null;
    }
    const all = await computeAllWrappedForPreview();
    return all.get(playerId) ?? null;
}
