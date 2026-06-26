"use client";

import { useState, useTransition } from "react";
import { refreshDataAction } from "@/app/actions/refresh";

export function RefreshDataButton() {
    const [status, setStatus] = useState<"idle" | "running" | "ok" | "error">("idle");
    const [message, setMessage] = useState<string | null>(null);
    const [, startTransition] = useTransition();

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
        });
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
