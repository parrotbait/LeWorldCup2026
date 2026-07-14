/**
 * Build any player's Wrapped ignoring the unlock gate. Callers MUST gate
 * access (dev environment or admin) — see app/wrapped/[playerId]/page.tsx.
 */
import type { WrappedData } from "@/lib/wrapped";
import { computeAllWrappedForPreview } from "@/lib/wrapped-store";

export async function buildWrappedForPreview(playerId: number): Promise<WrappedData | null> {
    const all = await computeAllWrappedForPreview();
    return all.get(playerId) ?? null;
}
