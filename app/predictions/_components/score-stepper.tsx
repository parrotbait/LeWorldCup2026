"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { savePredictionAction } from "@/app/actions/picks";
import { flag } from "@/lib/utils";

interface Props {
    matchId: number;
    initialHome: number | null;
    initialAway: number | null;
    locked: boolean;
    homeCode: string;
    homeName: string;
    awayCode: string;
    awayName: string;
}

export function ScoreStepper({
    matchId,
    initialHome,
    initialAway,
    locked,
    homeCode,
    homeName,
    awayCode,
    awayName,
}: Props) {
    // Display defaults to 0–0 so the steppers always have a sensible starting
    // point. We only persist once the user actually interacts (`touched`),
    // otherwise opening the page would silently file 0-0 picks for every match.
    const [home, setHome] = useState<number>(initialHome ?? 0);
    const [away, setAway] = useState<number>(initialAway ?? 0);
    const hasExistingPick = initialHome !== null && initialAway !== null;
    const [touched, setTouched] = useState<boolean>(hasExistingPick);
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [, startTransition] = useTransition();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Track what's actually persisted so the effect can compare without
    // depending on `status` (which the save itself mutates → loop bug).
    const lastSavedRef = useRef<{ h: number | null; a: number | null }>({
        h: initialHome,
        a: initialAway,
    });

    // Save with a small debounce so rapid stepper clicks coalesce.
    useEffect(() => {
        if (locked || !touched) {
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
    }, [home, away, matchId, locked, touched]);

    const bump = (which: "home" | "away", delta: number) => {
        if (locked) {
            return;
        }
        setTouched(true);
        if (which === "home") {
            setHome((v) => Math.max(0, Math.min(20, v + delta)));
        } else {
            setAway((v) => Math.max(0, Math.min(20, v + delta)));
        }
    };

    const Stepper = ({
        value,
        onBump,
    }: {
        value: number;
        onBump: (delta: number) => void;
    }) => (
        <div className="flex items-center gap-1">
            <button
                type="button"
                disabled={locked || value <= 0}
                onClick={() => onBump(-1)}
                className="h-8 w-8 rounded border border-ink/30 font-display text-base hover:bg-ink/5 disabled:opacity-30"
                aria-label="decrease"
            >
                −
            </button>
            <span className="w-7 text-center font-display text-xl tabular">{value}</span>
            <button
                type="button"
                disabled={locked || value >= 20}
                onClick={() => onBump(1)}
                className="h-8 w-8 rounded border border-ink/30 font-display text-base hover:bg-ink/5 disabled:opacity-30"
                aria-label="increase"
            >
                +
            </button>
        </div>
    );

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
                <span className="text-lg">{flag(homeCode)}</span>
                <span className="flex-1 text-right font-medium">{homeName}</span>
                <Stepper value={home} onBump={(d) => bump("home", d)} />
                <span className="font-display text-sm opacity-40">vs</span>
                <Stepper value={away} onBump={(d) => bump("away", d)} />
                <span className="flex-1 font-medium">{awayName}</span>
                <span className="text-lg">{flag(awayCode)}</span>
            </div>
            <div className="text-right font-display text-[10px] uppercase tracking-wider">
                {locked ? (
                    <span className="opacity-50">locked 🔒</span>
                ) : status === "saving" ? (
                    <span className="opacity-50">saving…</span>
                ) : status === "saved" ? (
                    <span className="text-pitch">saved ✓</span>
                ) : status === "error" ? (
                    <span className="text-tournament">{errorMsg}</span>
                ) : !touched ? (
                    <span className="opacity-30">tap +/− to predict</span>
                ) : null}
            </div>
        </div>
    );
}
