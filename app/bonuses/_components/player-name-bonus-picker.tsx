"use client";

import { useState, useTransition } from "react";
import { saveBonusAction, type SaveResult } from "@/app/actions/picks";

interface Props {
    kind: "TOP_SCORER";
    label: string;
    description: string;
    points: string;
    initialName: string | null;
    locked: boolean;
}

export function PlayerNameBonusPicker({
    kind,
    label,
    description,
    points,
    initialName,
    locked,
}: Props) {
    const [name, setName] = useState(initialName ?? "");
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const save = () => {
        if (name.trim().length === 0) {
            return;
        }
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("playerName", name.trim());
        setStatus("saving");
        startTransition(async () => {
            const res: SaveResult = await saveBonusAction(fd);
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
        <div className="rounded border border-ink/15 p-4">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-sm uppercase tracking-wider">{label}</h3>
                <span className="font-display text-xs text-tournament">{points}</span>
            </div>
            <p className="mt-1 text-xs opacity-60">{description}</p>

            <div className="mt-3 flex gap-2">
                <input
                    type="text"
                    disabled={locked}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={save}
                    placeholder="Player name (e.g. Kylian Mbappé)"
                    className="flex-1 rounded border border-ink/30 bg-paper px-3 py-2 text-sm focus:border-tournament focus:outline-none disabled:opacity-60"
                />
                <button
                    type="button"
                    onClick={save}
                    disabled={locked || name.trim().length === 0}
                    className="rounded bg-ink px-3 py-2 font-display text-xs uppercase tracking-widest text-paper disabled:opacity-40"
                >
                    save
                </button>
            </div>
            <div className="mt-1 h-4 text-[10px] uppercase tracking-wider">
                {locked ? (
                    <span className="opacity-50">locked 🔒</span>
                ) : status === "saving" ? (
                    <span className="opacity-50">saving…</span>
                ) : status === "saved" ? (
                    <span className="text-pitch">saved ✓</span>
                ) : status === "error" ? (
                    <span className="text-tournament">{errorMsg}</span>
                ) : null}
            </div>
        </div>
    );
}
