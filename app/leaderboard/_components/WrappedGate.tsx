import { getFrozenWrapped, hasSeenWrapped, wrappedUnlocked } from "@/lib/wrapped-store";
import { WrappedModalClient } from "./WrappedModalClient";

/**
 * Server gate for World Cup Wrapped. Renders nothing until unlocked; once
 * unlocked, freezes + loads the current player's payload and mounts the modal
 * (which renders the leaderboard entry button and, on first visit, auto-opens).
 *
 * `forceOpen` (from ?wrapped=1) auto-opens regardless of the seen flag — used
 * for shareable links so a player can hand someone the URL and have Wrapped
 * pop straight away.
 */
export async function WrappedGate({
    playerId,
    forceOpen = false,
}: {
    playerId: number;
    forceOpen?: boolean;
}) {
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
    return <WrappedModalClient data={data} autoOpen={forceOpen || !seen} />;
}
