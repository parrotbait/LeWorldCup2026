"use client";

import { useState, useTransition } from "react";
import { saveBonusAction, type SaveResult } from "@/app/actions/picks";

interface TeamOption {
    id: number;
    code: string;
    name: string;
    groupLetter: string | null;
}

interface Props {
    kind: "WINNER" | "GROUP_WINNER" | "DARK_HORSE" | "WOODEN_SPOON";
    label: string;
    description: string;
    points: string;
    options: TeamOption[];
    selectedTeamId: number | null;
    groupLetter?: string;
    locked: boolean;
}

export function TeamBonusPicker({
    kind,
    label,
    description,
    points,
    options,
    selectedTeamId,
    groupLetter,
    locked,
}: Props) {
    const [value, setValue] = useState<number | "">(selectedTeamId ?? "");
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const v = e.target.value === "" ? "" : Number(e.target.value);
        setValue(v);
        if (v === "") {
            return;
        }
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("teamId", String(v));
        if (groupLetter !== undefined) {
            fd.set("groupLetter", groupLetter);
        }
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

            <select
                disabled={locked}
                value={value}
                onChange={onChange}
                className="mt-3 w-full rounded border border-ink/30 bg-paper px-3 py-2 text-sm focus:border-tournament focus:outline-none disabled:opacity-60"
            >
                <option value="">— pick a team —</option>
                {options.map((t) => (
                    <option key={t.id} value={t.id}>
                        {t.name}
                        {t.groupLetter !== null ? ` (Group ${t.groupLetter})` : ""}
                    </option>
                ))}
            </select>

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
