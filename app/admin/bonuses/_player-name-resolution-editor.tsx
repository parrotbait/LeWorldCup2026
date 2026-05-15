"use client";

import { useState, useTransition } from "react";
import { saveBonusResolutionAction } from "@/app/actions/admin";

interface Props {
    kind: "TOP_SCORER" | "FIRST_GOAL_SCORER";
    label: string;
    description: string;
    points: string;
    initialNames: string[];
}

export function PlayerNameResolutionEditor({
    kind,
    label,
    description,
    points,
    initialNames,
}: Props) {
    const [names, setNames] = useState(initialNames.join(", "));
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [, startTransition] = useTransition();

    const save = () => {
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("playerNames", names);
        setStatus("saving");
        startTransition(async () => {
            const res = await saveBonusResolutionAction(fd);
            setStatus(res.ok ? "saved" : "error");
        });
    };

    return (
        <section className="rounded border border-ink/15 p-4">
            <header className="flex items-baseline justify-between">
                <h3 className="font-display text-sm uppercase tracking-wider">{label}</h3>
                <span className="font-display text-xs text-tournament">{points}</span>
            </header>
            <p className="mt-1 text-xs opacity-60">{description}</p>

            <div className="mt-3 flex gap-2">
                <input
                    type="text"
                    value={names}
                    onChange={(e) => setNames(e.target.value)}
                    placeholder="Comma-separated names (joint winners welcome)"
                    className="flex-1 rounded border border-ink/30 bg-paper px-3 py-2 text-sm focus:border-tournament focus:outline-none"
                />
                <button
                    type="button"
                    onClick={save}
                    className="rounded bg-ink px-3 py-2 font-display text-xs uppercase tracking-widest text-paper hover:bg-ink/90"
                >
                    save
                </button>
            </div>
            <div className="mt-1 h-4 text-[10px] uppercase tracking-wider">
                {status === "saving" ? (
                    <span className="opacity-60">saving…</span>
                ) : status === "saved" ? (
                    <span className="text-pitch">saved ✓</span>
                ) : status === "error" ? (
                    <span className="text-tournament">error</span>
                ) : null}
            </div>
        </section>
    );
}
