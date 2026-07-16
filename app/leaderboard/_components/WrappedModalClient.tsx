"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type { WrappedData } from "@/lib/wrapped";
import { markWrappedSeenAction } from "@/app/actions/wrapped";
import { buildCards } from "./WrappedCards";

export function WrappedModalClient({ data, autoOpen }: { data: WrappedData; autoOpen: boolean }) {
    const [open, setOpen] = useState(false);
    const [index, setIndex] = useState(0);
    const [showToast, setShowToast] = useState(false);
    const [shareState, setShareState] = useState<"idle" | "copied">("idle");
    const launchRef = useRef<HTMLButtonElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    const cards = buildCards(data); // always >= 3 entries

    // Auto-open once; persist the cross-device seen flag immediately so a
    // mid-story refresh doesn't re-pop it.
    useEffect(() => {
        if (autoOpen) {
            setOpen(true);
            void markWrappedSeenAction();
        }
    }, [autoOpen]);

    // Scroll-lock + focus the close button while open.
    useEffect(() => {
        if (!open) {
            return;
        }
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeRef.current?.focus();
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    const close = useCallback(() => {
        setOpen(false);
        setIndex(0);
        setShowToast(true);
        launchRef.current?.focus();
        window.setTimeout(() => setShowToast(false), 4000);
    }, []);

    const next = useCallback(
        () => setIndex((i) => Math.min(i + 1, cards.length - 1)),
        [cards.length],
    );
    const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

    // Keyboard nav.
    useEffect(() => {
        if (!open) {
            return;
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                close();
            } else if (e.key === "ArrowRight" || e.key === " ") {
                next();
            } else if (e.key === "ArrowLeft") {
                prev();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, close, next, prev]);

    // Touch swipe.
    const touchX = useRef<number | null>(null);
    const onTouchStart = (e: React.TouchEvent) => {
        touchX.current = e.touches[0]!.clientX;
    };
    const onTouchEnd = (e: React.TouchEvent) => {
        if (touchX.current === null) {
            return;
        }
        const dx = e.changedTouches[0]!.clientX - touchX.current;
        if (Math.abs(dx) > 40) {
            if (dx < 0) {
                next();
            } else {
                prev();
            }
        }
        touchX.current = null;
    };

    return (
        <div className="mt-4">
            <div className="flex flex-wrap gap-2">
                <button
                    ref={launchRef}
                    onClick={() => setOpen(true)}
                    className="rounded border border-tournament/50 bg-tournament/10 px-3 py-1.5 font-display text-[11px] uppercase tracking-wider text-tournament hover:bg-tournament/20"
                >
                    ↺ replay your 2026 wrapped
                </button>
                <button
                    onClick={async () => {
                        const url = `${window.location.origin}/leaderboard?wrapped=1`;
                        try {
                            await navigator.clipboard.writeText(url);
                            setShareState("copied");
                            window.setTimeout(() => setShareState("idle"), 2500);
                        } catch {
                            // Clipboard blocked — fall back to a prompt so the URL is still grabbable.
                            window.prompt("Copy this link", url);
                        }
                    }}
                    className="rounded border border-tournament/50 bg-tournament/10 px-3 py-1.5 font-display text-[11px] uppercase tracking-wider text-tournament hover:bg-tournament/20"
                >
                    {shareState === "copied" ? "✓ link copied" : "↗ share wrapped link"}
                </button>
            </div>

            {showToast ? (
                <p className="mt-2 text-[11px] uppercase tracking-wider text-tournament/80">
                    Sound — it&apos;s parked here on the leaderboard whenever you fancy another look.
                </p>
            ) : null}

            {open ? (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="World Cup Wrapped"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 backdrop-blur-sm"
                    onTouchStart={onTouchStart}
                    onTouchEnd={onTouchEnd}
                >
                    <div className="relative flex h-full w-full max-w-[440px] flex-col overflow-hidden bg-paper sm:h-[88vh] sm:rounded-xl sm:shadow-2xl">
                        {/* Progress bar */}
                        <div className="flex gap-1 px-4 pt-3">
                            {cards.map((_, i) => (
                                <button
                                    key={i}
                                    aria-label={`Go to card ${i + 1}`}
                                    onClick={() => setIndex(i)}
                                    className={`h-[3px] flex-1 rounded-full ${i <= index ? "bg-tournament" : "bg-ink/20"}`}
                                />
                            ))}
                        </div>

                        {/* Close */}
                        <button
                            ref={closeRef}
                            onClick={close}
                            aria-label="Close wrapped"
                            className="absolute right-3 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-ink/10 text-lg hover:bg-ink/20"
                        >
                            ✕
                        </button>

                        {/* Card */}
                        <div className="relative flex-1 overflow-hidden">
                            <div
                                role="group"
                                aria-roledescription="slide"
                                aria-label={`Card ${index + 1} of ${cards.length}`}
                                className="flex h-full items-center justify-center px-6"
                            >
                                {cards[index]}
                            </div>

                            {/* Tap zones (decorative; keyboard users have arrows) */}
                            <button
                                aria-hidden
                                tabIndex={-1}
                                onClick={prev}
                                className="absolute left-0 top-0 h-full w-1/3"
                            />
                            <button
                                aria-hidden
                                tabIndex={-1}
                                onClick={next}
                                className="absolute right-0 top-0 h-full w-1/3"
                            />
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
