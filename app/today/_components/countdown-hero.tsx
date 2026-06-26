"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

function formatCountdown(ms: number): string {
    if (ms <= 0) {
        return "any moment now";
    }
    const totalMins = Math.floor(ms / 60_000);
    const d = Math.floor(totalMins / (60 * 24));
    const h = Math.floor((totalMins % (60 * 24)) / 60);
    const m = totalMins % 60;
    const parts: string[] = [];
    if (d > 0) {
        parts.push(`${d}d`);
    }
    if (h > 0) {
        parts.push(`${h}h`);
    }
    parts.push(`${m}m`);
    return parts.join(" ");
}

export function CountdownHero({ nextKickoff }: { nextKickoff: string }) {
    const target = new Date(nextKickoff).getTime();
    const [remaining, setRemaining] = useState(target - Date.now());

    useEffect(() => {
        const interval = setInterval(() => {
            setRemaining(target - Date.now());
        }, 30_000);
        return () => {
            clearInterval(interval);
        };
    }, [target]);

    return (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
            <p className="font-display text-[10px] uppercase tracking-[0.3em] opacity-60">
                Next match in
            </p>
            <p className="font-display text-4xl tracking-wide">
                {formatCountdown(remaining)}
            </p>
            <Link
                href={"/predictions" as never}
                className="mt-2 rounded bg-pitch px-4 py-2 font-display text-xs uppercase tracking-wider text-paper hover:bg-pitch/80"
            >
                File your predictions →
            </Link>
        </div>
    );
}
