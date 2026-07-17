"use client";

import { useState, useTransition } from "react";
import { rebuildAllWrappedAction } from "@/app/actions/wrapped";

export function RebuildAllWrappedButton() {
    const [pending, startTransition] = useTransition();
    const [status, setStatus] = useState<string | null>(null);

    return (
        <div className="flex items-center gap-3">
            <button
                type="button"
                disabled={pending}
                onClick={() => {
                    if (!window.confirm("Clear every frozen Wrapped payload? Next open recomputes each player from live data.")) {
                        return;
                    }
                    setStatus(null);
                    startTransition(async () => {
                        const { cleared } = await rebuildAllWrappedAction();
                        setStatus(`Cleared ${cleared} frozen payload${cleared === 1 ? "" : "s"}. Next open will recompute.`);
                    });
                }}
                className="rounded border border-tournament/60 bg-tournament/10 px-3 py-1.5 font-display text-[11px] uppercase tracking-wider text-tournament hover:bg-tournament/20 disabled:opacity-50"
            >
                {pending ? "clearing…" : "↻ rebuild all wrapped"}
            </button>
            {status !== null ? (
                <span className="text-[11px] uppercase tracking-wider text-pitch">{status}</span>
            ) : null}
        </div>
    );
}
