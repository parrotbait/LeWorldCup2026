"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshDataAction } from "@/app/actions/refresh";

const AUTO_REFRESH_INTERVAL_MS = 3 * 60_000;

export function RefreshDataButton() {
    const router = useRouter();
    const [status, setStatus] = useState<"idle" | "running" | "ok" | "error">("idle");
    const [message, setMessage] = useState<string | null>(null);
    const [, startTransition] = useTransition();
    const [secondsLeft, setSecondsLeft] = useState(AUTO_REFRESH_INTERVAL_MS / 1000);
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
    const lastKnownSync = useRef<string | null>(null);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resetCountdown = useCallback(() => {
        setSecondsLeft(AUTO_REFRESH_INTERVAL_MS / 1000);
    }, []);

    const checkForUpdates = useCallback(async () => {
        try {
            const res = await fetch("/api/sync-pulse", { cache: "no-store" });
            if (!res.ok) {
                return;
            }
            const data: { didSync: boolean; lastSyncAt: string | null; hasLiveMatches: boolean } = await res.json();
            setLastSyncAt(data.lastSyncAt);
            lastKnownSync.current = data.lastSyncAt;

            if (data.didSync) {
                router.refresh();
            }
        } catch {
            // Silent — retry next interval
        }
        resetCountdown();
    }, [router, resetCountdown]);

    useEffect(() => {
        checkForUpdates();

        countdownRef.current = setInterval(() => {
            setSecondsLeft((s) => {
                if (s <= 1) {
                    return AUTO_REFRESH_INTERVAL_MS / 1000;
                }
                return s - 1;
            });
        }, 1000);

        pollRef.current = setInterval(() => {
            checkForUpdates();
        }, AUTO_REFRESH_INTERVAL_MS);

        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                checkForUpdates();
                resetCountdown();
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            if (countdownRef.current !== null) {
                clearInterval(countdownRef.current);
            }
            if (pollRef.current !== null) {
                clearInterval(pollRef.current);
            }
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [checkForUpdates, resetCountdown]);

    const onClick = (): void => {
        setStatus("running");
        setMessage(null);
        startTransition(async () => {
            const res = await refreshDataAction();
            if (!res.ok) {
                setStatus("error");
                setMessage(res.error ?? "Sync failed");
                return;
            }
            setStatus("ok");
            setMessage(`Synced ${res.matchCount ?? 0} matches`);
            lastKnownSync.current = new Date().toISOString();
            setLastSyncAt(new Date().toISOString());
            resetCountdown();
        });
    };

    const formatCountdown = (secs: number): string => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        if (m > 0) {
            return `${m}:${s.toString().padStart(2, "0")}`;
        }
        return `${s}s`;
    };

    const formatLastSync = (iso: string): string => {
        const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
        if (diff < 60) {
            return "just now";
        }
        if (diff < 3600) {
            return `${Math.floor(diff / 60)}m ago`;
        }
        return `${Math.floor(diff / 3600)}h ago`;
    };

    return (
        <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
                type="button"
                onClick={onClick}
                disabled={status === "running"}
                className="inline-flex items-center gap-2 rounded border border-ink/30 px-3 py-1.5 font-display text-[11px] uppercase tracking-wider hover:border-ink/60 disabled:opacity-40"
            >
                {status === "running" ? (
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
                ) : null}
                {status === "running" ? "syncing…" : "refresh data"}
            </button>
            <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-wider opacity-50">
                <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pitch opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-pitch" />
                </span>
                auto-refresh in {formatCountdown(secondsLeft)}
            </span>
            {lastSyncAt !== null && status !== "ok" && (
                <span className="text-[10px] opacity-40">
                    · synced {formatLastSync(lastSyncAt)}
                </span>
            )}
            {message !== null ? (
                <span
                    className={`text-xs ${
                        status === "ok" ? "text-pitch" : status === "error" ? "text-tournament" : ""
                    }`}
                >
                    {message}
                </span>
            ) : status === "running" ? (
                <span className="text-xs opacity-50">
                    This can take up to 2 minutes.
                </span>
            ) : null}
        </div>
    );
}
