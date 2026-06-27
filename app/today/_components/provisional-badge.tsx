"use client";

export function ProvisionalBadge({
    points,
    isExact,
    isJoker,
}: {
    points: number;
    isExact: boolean;
    isJoker: boolean;
}) {
    return (
        <span className="animate-pulse font-display tabular text-lg opacity-70">
            {points}
            {isExact && (
                <span className="ml-1 text-[10px] uppercase">exact</span>
            )}
            {isJoker && (
                <span className="ml-1 text-[10px] text-mustard uppercase">×2</span>
            )}
        </span>
    );
}
