"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { savePredictionAction } from "@/app/actions/picks";

interface Props {
    matchId: number;
    initialHome: number | null;
    initialAway: number | null;
    locked: boolean;
}

export function ScoreStepper({ matchId, initialHome, initialAway, locked }: Props) {
    const [home, setHome] = useState<number | null>(initialHome);
    const [away, setAway] = useState<number | null>(initialAway);
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [, startTransition] = useTransition();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Track what we've actually persisted so the effect can compare against
    // it without depending on `status` (which the save itself mutates and
    // would otherwise re-trigger the effect → infinite loop).
    const lastSavedRef = useRef<{ h: number | null; a: number | null }>({
        h: initialHome,
        a: initialAway,
    });

    // Save with a small debounce so rapid stepper clicks coalesce.
    useEffect(() => {
        if (locked) {
            return;
        }
        if (home === null || away === null) {
            return;
        }
        if (home === lastSavedRef.current.h && away === lastSavedRef.current.a) {
            return;
        }

        if (debounceRef.current !== null) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
            const fd = new FormData();
            fd.set("matchId", String(matchId));
            fd.set("homeScore", String(home));
            fd.set("awayScore", String(away));
            setStatus("saving");
            startTransition(async () => {
                const res = await savePredictionAction(fd);
                if (res.ok) {
                    lastSavedRef.current = { h: home, a: away };
                    setStatus("saved");
                    setErrorMsg(null);
                } else {
                    setStatus("error");
                    setErrorMsg(res.error ?? "Couldn't save");
                }
            });
        }, 350);

        return () => {
            if (debounceRef.current !== null) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [home, away, matchId, locked]);

    const Box = ({
        value,
        setValue,
    }: {
        value: number | null;
        setValue: (n: number) => void;
    }) => (
        <div className="flex items-center gap-1">
            <button
                type="button"
                disabled={locked || (value ?? 0) <= 0}
                onClick={() => setValue(Math.max(0, (value ?? 0) - 1))}
                className="h-8 w-8 rounded border border-ink/30 font-display text-base hover:bg-ink/5 disabled:opacity-30"
                aria-label="decrease"
            >
                −
            </button>
            <span className="w-8 text-center font-display text-xl tabular">
                {value ?? "–"}
            </span>
            <button
                type="button"
                disabled={locked || (value ?? 0) >= 20}
                onClick={() => setValue(Math.min(20, (value ?? 0) + 1))}
                className="h-8 w-8 rounded border border-ink/30 font-display text-base hover:bg-ink/5 disabled:opacity-30"
                aria-label="increase"
            >
                +
            </button>
        </div>
    );

    return (
        <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-3">
                <Box value={home} setValue={(n) => setHome(n)} />
                <span className="font-display opacity-40">:</span>
                <Box value={away} setValue={(n) => setAway(n)} />
            </div>
            {status === "saving" ? (
                <span className="font-display text-[10px] uppercase opacity-50">saving…</span>
            ) : status === "saved" ? (
                <span className="font-display text-[10px] uppercase text-pitch">saved ✓</span>
            ) : status === "error" ? (
                <span className="font-display text-[10px] uppercase text-tournament">
                    {errorMsg}
                </span>
            ) : locked ? (
                <span className="font-display text-[10px] uppercase opacity-50">locked 🔒</span>
            ) : (
                <span className="font-display text-[10px] uppercase opacity-30">tap to pick</span>
            )}
        </div>
    );
}
