"use client";

import { useState, useTransition } from "react";
import { saveBonusResolutionAction } from "@/app/actions/admin";

interface TeamOpt {
    id: number;
    name: string;
    code: string;
    groupLetter: string | null;
}

interface Props {
    kind:
        | "WINNER"
        | "DARK_HORSE"
        | "WOODEN_SPOON"
        | "PANTOMIME_VILLAIN"
        | "SIEVE"
        | "MIGHTY_FALLEN";
    label: string;
    description: string;
    points: string;
    options: TeamOpt[];
    selectedTeamIds: number[];
}

export function TeamResolutionEditor({
    kind,
    label,
    description,
    points,
    options,
    selectedTeamIds,
}: Props) {
    const [selected, setSelected] = useState<Set<number>>(new Set(selectedTeamIds));
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [, startTransition] = useTransition();

    const toggle = (id: number) => {
        const next = new Set(selected);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelected(next);
    };

    const save = () => {
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("teamIds", Array.from(selected).join(","));
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

            <div className="mt-3 max-h-48 overflow-y-auto rounded border border-ink/10 p-2 text-xs">
                {options.length === 0 ? (
                    <p className="opacity-60">No teams loaded yet.</p>
                ) : (
                    options.map((t) => (
                        <label key={t.id} className="flex cursor-pointer items-center gap-2 py-0.5">
                            <input
                                type="checkbox"
                                checked={selected.has(t.id)}
                                onChange={() => toggle(t.id)}
                                className="accent-tournament"
                            />
                            <span>
                                {t.name}
                                {t.groupLetter !== null ? (
                                    <span className="ml-1 opacity-50">({t.groupLetter})</span>
                                ) : null}
                            </span>
                        </label>
                    ))
                )}
            </div>

            <div className="mt-2 flex items-center gap-3">
                <button
                    type="button"
                    onClick={save}
                    className="rounded bg-ink px-3 py-1.5 font-display text-xs uppercase tracking-widest text-paper hover:bg-ink/90"
                >
                    save
                </button>
                <span className="font-display text-[10px] uppercase">
                    {status === "saving" ? (
                        <span className="opacity-60">saving…</span>
                    ) : status === "saved" ? (
                        <span className="text-pitch">saved ✓</span>
                    ) : status === "error" ? (
                        <span className="text-tournament">error</span>
                    ) : null}
                </span>
                <span className="ml-auto text-[10px] opacity-50">
                    {selected.size === 0
                        ? "no winner set"
                        : selected.size === 1
                          ? "single winner"
                          : `${selected.size} tied — all credit`}
                </span>
            </div>
        </section>
    );
}
