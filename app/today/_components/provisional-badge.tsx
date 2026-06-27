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
        <span className="inline-flex items-center gap-1.5 font-display tabular text-lg opacity-50">
            +{points}
            {isExact && (
                <span className="text-[10px] uppercase">exact</span>
            )}
            {isJoker && (
                <span className="text-[10px] text-mustard uppercase">×2</span>
            )}
            <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tournament opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-tournament" />
            </span>
        </span>
    );
}
