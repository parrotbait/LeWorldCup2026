"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 3 * 60_000;

interface LiveMinuteInfo {
    externalId: number;
    minute: number | null;
}

interface SyncPulseResponse {
    didSync: boolean;
    lastSyncAt: string | null;
    liveMinutes: LiveMinuteInfo[];
}

let sharedMinuteMap: Map<number, number | null> = new Map();
let listeners: Set<() => void> = new Set();
let pollActive = false;
let pollIntervalId: ReturnType<typeof setInterval> | null = null;
let lastPollTime = 0;
let routerRefreshFn: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;

async function doPoll() {
    try {
        const res = await fetch("/api/sync-pulse", { cache: "no-store" });
        if (!res.ok) {
            return;
        }
        const data: SyncPulseResponse = await res.json();
        lastPollTime = Date.now();

        const newMap = new Map<number, number | null>();
        for (const info of data.liveMinutes) {
            newMap.set(info.externalId, info.minute);
        }
        sharedMinuteMap = newMap;
        listeners.forEach((cb) => cb());

        if (data.didSync && routerRefreshFn !== null) {
            routerRefreshFn();
        }
    } catch {
        // Silent — retry on next interval
    }
}

function startPolling(refreshFn: () => void) {
    routerRefreshFn = refreshFn;
    if (pollActive) {
        return;
    }
    pollActive = true;
    doPoll();
    pollIntervalId = setInterval(doPoll, POLL_INTERVAL_MS);

    visibilityHandler = () => {
        if (document.visibilityState === "visible") {
            const elapsed = Date.now() - lastPollTime;
            if (elapsed >= POLL_INTERVAL_MS) {
                doPoll();
            }
            if (pollIntervalId === null) {
                pollIntervalId = setInterval(doPoll, POLL_INTERVAL_MS);
            }
        } else {
            if (pollIntervalId !== null) {
                clearInterval(pollIntervalId);
                pollIntervalId = null;
            }
        }
    };

    document.addEventListener("visibilitychange", visibilityHandler);
}

function stopPolling() {
    if (listeners.size > 0) {
        return;
    }
    pollActive = false;
    if (pollIntervalId !== null) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
    }
    if (visibilityHandler !== null) {
        document.removeEventListener("visibilitychange", visibilityHandler);
        visibilityHandler = null;
    }
}

interface LiveStatusBadgeProps {
    externalId: number;
    initialMinute?: number | null;
}

export function LiveStatusBadge({ externalId, initialMinute }: LiveStatusBadgeProps) {
    const router = useRouter();
    const [minute, setMinute] = useState<number | null>(
        sharedMinuteMap.get(externalId) ?? initialMinute ?? null,
    );

    useEffect(() => {
        const update = () => {
            setMinute(sharedMinuteMap.get(externalId) ?? null);
        };

        listeners.add(update);
        startPolling(() => router.refresh());

        return () => {
            listeners.delete(update);
            stopPolling();
        };
    }, [externalId, router]);

    return (
        <span className="inline-flex items-center gap-1 font-display text-[10px] uppercase tracking-widest text-tournament">
            <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tournament opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-tournament" />
            </span>
            {minute !== null ? `${minute}′` : "live"}
        </span>
    );
}
