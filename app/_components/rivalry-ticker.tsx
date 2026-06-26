"use client";

export interface RivalryPlayer {
    displayName: string;
    pointsToday: number;
    totalPoints: number;
}

interface Props {
    you: RivalryPlayer;
    above: RivalryPlayer | null;
    below: RivalryPlayer | null;
}

function GapBadge({ diff, label }: { diff: number; label: string }) {
    const color = diff > 0 ? "text-pitch" : diff < 0 ? "text-tournament" : "opacity-50";
    const sign = diff > 0 ? "+" : "";
    return (
        <div className="flex flex-col items-center">
            <span className={`font-display text-sm tabular ${color}`}>
                {sign}{diff}
            </span>
            <span className="text-[9px] uppercase tracking-wider opacity-50">{label}</span>
        </div>
    );
}

function TotalGap({ diff }: { diff: number }) {
    if (diff === 0) {
        return (
            <div className="flex flex-col items-center">
                <span className="font-display text-sm opacity-50">tied</span>
                <span className="text-[9px] uppercase tracking-wider opacity-50">overall</span>
            </div>
        );
    }
    const ahead = diff > 0;
    return (
        <div className="flex flex-col items-center">
            <span className={`font-display text-sm tabular ${ahead ? "text-pitch" : "text-tournament"}`}>
                {Math.abs(diff)} pts
            </span>
            <span className="text-[9px] uppercase tracking-wider opacity-50">
                {ahead ? "ahead" : "behind"}
            </span>
        </div>
    );
}

export function RivalryTicker({ you, above, below }: Props) {
    if (above === null && below === null) {
        return null;
    }

    return (
        <div className="rounded border border-ink/15 px-4 py-3">
            <p className="font-display text-[10px] uppercase tracking-widest opacity-50">
                Your rivals today
            </p>
            <div className="mt-2 space-y-2">
                {above !== null && (
                    <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate opacity-70">
                            ▲ {above.displayName}
                        </span>
                        <div className="flex items-center gap-4">
                            <GapBadge diff={you.pointsToday - above.pointsToday} label="today" />
                            <TotalGap diff={you.totalPoints - above.totalPoints} />
                        </div>
                    </div>
                )}
                {below !== null && (
                    <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate opacity-70">
                            ▼ {below.displayName}
                        </span>
                        <div className="flex items-center gap-4">
                            <GapBadge diff={you.pointsToday - below.pointsToday} label="today" />
                            <TotalGap diff={you.totalPoints - below.totalPoints} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
