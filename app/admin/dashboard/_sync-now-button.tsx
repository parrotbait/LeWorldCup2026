"use client";

import { useState, useTransition } from "react";
import { triggerSyncAction } from "@/app/actions/admin";

export function SyncNowButton() {
    const [status, setStatus] = useState<"idle" | "running" | "ok" | "error">("idle");
    const [message, setMessage] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const onClick = (): void => {
        setStatus("running");
        setMessage(null);
        startTransition(async () => {
            const res = await triggerSyncAction();
            if (!res.ok) {
                setStatus("error");
                setMessage(res.error ?? "Sync failed");
                return;
            }
            const errors = res.syncErrors ?? [];
            if (errors.length > 0) {
                setStatus("error");
                setMessage(`Synced ${res.matchCount ?? 0} matches but: ${errors.join("; ")}`);
                return;
            }
            setStatus("ok");
            setMessage(
                `Synced ${res.teamCount ?? 0} teams · ${res.matchCount ?? 0} matches`,
            );
        });
    };

    return (
        <div className="flex flex-wrap items-center gap-3">
            <button
                type="button"
                onClick={onClick}
                disabled={status === "running"}
                className="rounded bg-ink px-3 py-2 font-display text-xs uppercase tracking-widest text-paper hover:bg-ink/90 disabled:opacity-40"
            >
                {status === "running" ? "syncing…" : "sync now"}
            </button>
            {message !== null ? (
                <span
                    className={`text-xs ${
                        status === "ok" ? "text-pitch" : status === "error" ? "text-tournament" : ""
                    }`}
                >
                    {message}
                </span>
            ) : (
                <span className="text-xs opacity-60">
                    Pulls fresh teams + matches from football-data.org. Safe to run any time.
                </span>
            )}
        </div>
    );
}
