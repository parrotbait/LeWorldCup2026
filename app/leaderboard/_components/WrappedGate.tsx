import { getFrozenWrapped, hasSeenWrapped, wrappedUnlocked } from "@/lib/wrapped-store";
import { WrappedModalClient } from "./WrappedModalClient";

/**
 * Server gate for World Cup Wrapped. Renders nothing until unlocked; once
 * unlocked, freezes + loads the current player's payload and mounts the modal
 * (which renders the leaderboard entry button and, on first visit, auto-opens).
 */
export async function WrappedGate({ playerId }: { playerId: number }) {
    if (!(await wrappedUnlocked())) {
        return null;
    }
    const [data, seen] = await Promise.all([
        getFrozenWrapped(playerId),
        hasSeenWrapped(playerId),
    ]);
    if (data === null) {
        return null;
    }
    return <WrappedModalClient data={data} autoOpen={!seen} />;
}
