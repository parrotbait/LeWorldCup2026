"use client";

import { useRef, useState, useTransition } from "react";
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
    // Set once the match has finished. When defined, the row shows the
    // actual score and the points the player earned for their pick.
    actualHome?: number | null;
    actualAway?: number | null;
    earnedPoints?: number;
    isExact?: boolean;
    hasPick?: boolean;
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
    actualHome,
    actualAway,
    earnedPoints,
    isExact,
    hasPick,
}: Props) {
    // Strings so the inputs can be empty without React fighting "" vs null.
    const [home, setHome] = useState<string>(initialHome?.toString() ?? "");
    const [away, setAway] = useState<string>(initialAway?.toString() ?? "");
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [, startTransition] = useTransition();
    // Track what's already persisted so blur doesn't re-fire identical saves.
    const lastSavedRef = useRef<{ h: number | null; a: number | null }>({
        h: initialHome,
        a: initialAway,
    });

    const parse = (s: string): number | null => {
        if (s.trim() === "") {
            return null;
        }
        const n = Number(s);
        if (!Number.isInteger(n) || n < 0 || n > 20) {
            return null;
        }
        return n;
    };

    const save = (): void => {
        if (locked) {
            return;
        }
        const h = parse(home);
        const a = parse(away);
        if (h === null || a === null) {
            // Wait until both sides are valid integers before persisting.
            return;
        }
        if (h === lastSavedRef.current.h && a === lastSavedRef.current.a) {
            return;
        }

        const fd = new FormData();
        fd.set("matchId", String(matchId));
        fd.set("homeScore", String(h));
        fd.set("awayScore", String(a));
        setStatus("saving");
        startTransition(async () => {
            const res = await savePredictionAction(fd);
            if (res.ok) {
                lastSavedRef.current = { h, a };
                setStatus("saved");
                setErrorMsg(null);
            } else {
                setStatus("error");
                setErrorMsg(res.error ?? "Couldn't save");
            }
        });
    };

    const inputClass =
        "h-10 w-14 rounded border border-ink/30 bg-paper text-center font-display text-xl tabular focus:border-tournament focus:outline-none disabled:opacity-60";

    const handleChange =
        (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
            // Strip anything that isn't a digit so we never need to format on save.
            setter(e.target.value.replace(/\D/g, ""));
        };

    const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.currentTarget.blur();
        }
    };

    const parsedHome = parse(home);
    const parsedAway = parse(away);
    const bothFilled = parsedHome !== null && parsedAway !== null;
    const matchesSaved =
        bothFilled &&
        parsedHome === lastSavedRef.current.h &&
        parsedAway === lastSavedRef.current.a;

    const settled = actualHome !== null && actualHome !== undefined && actualAway !== null && actualAway !== undefined;
    const pts = earnedPoints ?? 0;

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-center gap-3">
                <span className="text-lg">{flag(homeCode)}</span>
                <span className="min-w-[140px] text-right font-medium">{homeName}</span>
                <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    disabled={locked}
                    value={home}
                    onChange={handleChange(setHome)}
                    onBlur={save}
                    onKeyDown={handleEnter}
                    aria-label={`${homeName} score`}
                    className={inputClass}
                />
                <span className="font-display text-sm opacity-40">vs</span>
                <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    disabled={locked}
                    value={away}
                    onChange={handleChange(setAway)}
                    onBlur={save}
                    onKeyDown={handleEnter}
                    aria-label={`${awayName} score`}
                    className={inputClass}
                />
                <span className="min-w-[140px] font-medium">{awayName}</span>
                <span className="text-lg">{flag(awayCode)}</span>
            </div>
            <div className="min-h-[14px] text-center font-display text-[10px] uppercase tracking-wider">
                {settled ? (
                    <span>
                        <span className="opacity-60">
                            full time {actualHome}–{actualAway}
                        </span>
                        <span className="mx-2 opacity-30">·</span>
                        {hasPick === false ? (
                            <span className="text-tournament">no pick — 0 pts</span>
                        ) : isExact ? (
                            <span className="text-pitch">+{pts} exact</span>
                        ) : pts > 0 ? (
                            <span className="opacity-80">+{pts} result</span>
                        ) : (
                            <span className="opacity-40">missed — 0 pts</span>
                        )}
                    </span>
                ) : status === "saving" ? (
                    <span className="opacity-50">saving…</span>
                ) : status === "error" ? (
                    <span className="text-tournament">{errorMsg}</span>
                ) : locked ? (
                    <span className="opacity-50">locked 🔒</span>
                ) : !bothFilled ? (
                    <span className="opacity-30">enter both scores to save</span>
                ) : matchesSaved ? (
                    <span className="opacity-40">saved</span>
                ) : null}
            </div>
        </div>
    );
}
