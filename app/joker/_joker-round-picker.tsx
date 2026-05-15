"use client";

import { useState, useTransition } from "react";
import { saveJokerAction } from "@/app/actions/picks";

interface MatchOpt {
    id: number;
    label: string;
    kickoff: string;
}

interface Props {
    round: "R32" | "R16" | "QF" | "SF" | "THIRD" | "FINAL";
    roundLabel: string;
    matches: MatchOpt[];
    selectedMatchId: number | null;
    locked: boolean;
}

export function JokerRoundPicker({ round, roundLabel, matches, selectedMatchId, locked }: Props) {
    const [value, setValue] = useState<number | null>(selectedMatchId);
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const onSelect = (id: number) => {
        if (locked) {
            return;
        }
        setValue(id);
        const fd = new FormData();
        fd.set("round", round);
        fd.set("matchId", String(id));
        setStatus("saving");
        startTransition(async () => {
            const res = await saveJokerAction(fd);
            if (res.ok) {
                setStatus("saved");
                setErrorMsg(null);
            } else {
                setStatus("error");
                setErrorMsg(res.error ?? "Couldn't save");
            }
        });
    };

    if (matches.length === 0) {
        return (
            <section className="rounded border border-dashed border-ink/20 p-4">
                <h3 className="font-display text-sm uppercase tracking-wider">{roundLabel}</h3>
                <p className="mt-1 text-xs opacity-50">Bracket not set yet — joker opens when matches appear.</p>
            </section>
        );
    }

    return (
        <section className="rounded border border-ink/15 p-4">
            <header className="flex items-baseline justify-between">
                <h3 className="font-display text-sm uppercase tracking-wider">{roundLabel}</h3>
                <span className="font-display text-xs text-tournament">×2</span>
            </header>
            <ul className="mt-3 space-y-2">
                {matches.map((m) => {
                    const selected = value === m.id;
                    return (
                        <li key={m.id}>
                            <label
                                className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2 text-sm ${
                                    selected ? "border-tournament bg-mustard/10" : "border-ink/15"
                                } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
                            >
                                <input
                                    type="radio"
                                    name={`joker-${round}`}
                                    checked={selected}
                                    disabled={locked}
                                    onChange={() => onSelect(m.id)}
                                    className="accent-tournament"
                                />
                                <span className="flex-1">{m.label}</span>
                                <span className="font-display text-xs opacity-60">{m.kickoff}</span>
                            </label>
                        </li>
                    );
                })}
            </ul>
            <div className="mt-2 h-4 text-[10px] uppercase tracking-wider">
                {locked ? (
                    <span className="opacity-50">round started — locked 🔒</span>
                ) : status === "saving" ? (
                    <span className="opacity-50">saving…</span>
                ) : status === "saved" ? (
                    <span className="text-pitch">saved ✓</span>
                ) : status === "error" ? (
                    <span className="text-tournament">{errorMsg}</span>
                ) : value === null ? (
                    <span className="opacity-40">pick a match to use your joker</span>
                ) : null}
            </div>
        </section>
    );
}
