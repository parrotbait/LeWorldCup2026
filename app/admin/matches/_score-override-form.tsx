"use client";

import { useState, useTransition } from "react";
import { overrideScoreAction } from "@/app/actions/admin";

interface Props {
    matchId: number;
    initialHome: number | null;
    initialAway: number | null;
    overridden: boolean;
}

export function ScoreOverrideForm({ matchId, initialHome, initialAway, overridden }: Props) {
    const [home, setHome] = useState(initialHome ?? 0);
    const [away, setAway] = useState(initialAway ?? 0);
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const onSave = () => {
        const fd = new FormData();
        fd.set("matchId", String(matchId));
        fd.set("homeScore", String(home));
        fd.set("awayScore", String(away));
        setStatus("saving");
        startTransition(async () => {
            const res = await overrideScoreAction(fd);
            if (res.ok) {
                setStatus("saved");
                setErrorMsg(null);
            } else {
                setStatus("error");
                setErrorMsg(res.error ?? "Couldn't save");
            }
        });
    };

    return (
        <div className="flex items-center gap-2">
            <input
                type="number"
                min={0}
                max={20}
                value={home}
                onChange={(e) => setHome(Number(e.target.value))}
                className="w-14 rounded border border-ink/30 bg-paper px-2 py-1 text-center font-display tabular focus:border-tournament focus:outline-none"
            />
            <span className="opacity-40">:</span>
            <input
                type="number"
                min={0}
                max={20}
                value={away}
                onChange={(e) => setAway(Number(e.target.value))}
                className="w-14 rounded border border-ink/30 bg-paper px-2 py-1 text-center font-display tabular focus:border-tournament focus:outline-none"
            />
            <button
                type="button"
                onClick={onSave}
                className="rounded bg-tournament px-3 py-1 font-display text-xs uppercase tracking-widest text-paper hover:bg-tournament/90"
            >
                save
            </button>
            {overridden ? (
                <span className="font-display text-[10px] uppercase text-mustard">overridden</span>
            ) : null}
            {status === "saving" ? (
                <span className="font-display text-[10px] uppercase opacity-60">saving…</span>
            ) : status === "saved" ? (
                <span className="font-display text-[10px] uppercase text-pitch">saved ✓</span>
            ) : status === "error" ? (
                <span className="font-display text-[10px] uppercase text-tournament">{errorMsg}</span>
            ) : null}
        </div>
    );
}
