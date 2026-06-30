"use client";

import { useRef, useState, useTransition } from "react";
import { savePredictionAction } from "@/app/actions/picks";
import { flag, scoreSubtitle } from "@/lib/utils";

interface Props {
    matchId: number;
    initialHome: number | null;
    initialAway: number | null;
    locked: boolean;
    homeCode: string;
    homeName: string;
    awayCode: string;
    awayName: string;
    matchStatus: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED";
    // Set once the match has finished. When defined, the row shows the
    // actual score and the points the player earned for their pick.
    actualHome?: number | null;
    actualAway?: number | null;
    // Optional 90-min and pens scores for the AET / pens decoration on
    // settled knockout rows. When the FT score differs from the AET-final
    // (homeScore/awayScore) we surface the FT line; when pens decided the
    // match we surface the shootout score too.
    actualHomeFt?: number | null;
    actualAwayFt?: number | null;
    actualHomePens?: number | null;
    actualAwayPens?: number | null;
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
    matchStatus,
    actualHome,
    actualAway,
    actualHomeFt,
    actualAwayFt,
    actualHomePens,
    actualAwayPens,
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

    const settled =
        matchStatus === "FINISHED" &&
        actualHome !== null &&
        actualHome !== undefined &&
        actualAway !== null &&
        actualAway !== undefined;
    // Live: scores are populated but the match is still running. We surface
    // them as the current score, NOT the final result, and skip points
    // language so a missed pick doesn't get marked "missed" mid-match.
    const live =
        matchStatus === "LIVE" &&
        actualHome !== null &&
        actualHome !== undefined &&
        actualAway !== null &&
        actualAway !== undefined;
    const pts = earnedPoints ?? 0;

    return (
        <div className="flex flex-col gap-1">
            {/* Mobile: stacked rows — one per team. Avoids horizontal scroll on phones. */}
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 sm:hidden">
                <span className="text-base">{flag(homeCode)}</span>
                <span className="truncate font-medium">{homeName}</span>
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
                <span className="text-base">{flag(awayCode)}</span>
                <span className="truncate font-medium">{awayName}</span>
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
            </div>

            {/* Desktop: original single-row layout. */}
            <div className="hidden items-center justify-center gap-3 sm:flex">
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
            <div className="mt-1 min-h-[18px] text-center font-display uppercase tracking-wider">
                {live ? (
                    <span className="text-sm sm:text-base">
                        <span className="text-tournament">● live</span>
                        <span className="mx-2 opacity-30">·</span>
                        <span className="opacity-70">
                            current {actualHome}–{actualAway}
                        </span>
                    </span>
                ) : settled ? (
                    <div className={`mx-auto inline-flex flex-col items-center rounded-md border px-3 py-1.5 ${isExact ? "border-pitch/40 bg-pitch/10" : hasPick === false ? "border-tournament/30 bg-tournament/5" : pts > 0 ? "border-ink/20 bg-ink/5" : "border-tournament/30 bg-tournament/5"}`}>
                        <span className="flex items-center gap-2 text-sm sm:text-base">
                            <span className="opacity-60">
                                FT {actualHome}–{actualAway}
                            </span>
                            <span className="opacity-30">·</span>
                            {hasPick === false ? (
                                <span className="opacity-70">no pick — <span className="font-bold text-tournament">0</span></span>
                            ) : isExact ? (
                                <span className="opacity-70">exact <span className="font-bold text-pitch">+{pts}</span></span>
                            ) : pts > 0 ? (
                                <span className="opacity-70">result <span className="font-semibold text-pitch">+{pts}</span></span>
                            ) : (
                                <span className="opacity-70">missed <span className="font-bold text-tournament">0</span></span>
                            )}
                        </span>
                        {(() => {
                            const subtitle = scoreSubtitle({
                                homeScore: actualHome ?? null,
                                awayScore: actualAway ?? null,
                                homeScoreFt: actualHomeFt ?? null,
                                awayScoreFt: actualAwayFt ?? null,
                                homeScorePens: actualHomePens ?? null,
                                awayScorePens: actualAwayPens ?? null,
                            });
                            if (subtitle === null) {
                                return null;
                            }
                            return (
                                <span className="text-[10px] opacity-60">
                                    {subtitle}
                                </span>
                            );
                        })()}
                    </div>
                ) : status === "saving" ? (
                    <span className="text-xs opacity-50">saving…</span>
                ) : status === "error" ? (
                    <span className="text-xs text-tournament">{errorMsg}</span>
                ) : locked ? (
                    <span className="text-xs opacity-50">locked 🔒</span>
                ) : !bothFilled ? (
                    <span className="text-xs opacity-30">enter both scores to save</span>
                ) : matchesSaved ? (
                    <span className="text-xs opacity-40">saved</span>
                ) : null}
            </div>
        </div>
    );
}
