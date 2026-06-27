"use client";

import { useEffect } from "react";

/**
 * Scrolls the named day section into view on mount. Used to land the user on
 * today's (or the next upcoming) matchday when they open the predictions page,
 * so they don't have to scroll past finished games on mobile.
 *
 * If the URL already contains a hash (e.g. #match-123), defers to the browser's
 * native hash scroll instead.
 */
export function ScrollToDay({ dayKey }: { dayKey: string }) {
    useEffect(() => {
        if (window.location.hash) {
            const target = document.getElementById(window.location.hash.slice(1));
            if (target !== null) {
                const details = target.closest("details");
                if (details !== null && !details.open) {
                    details.open = true;
                }
                requestAnimationFrame(() => {
                    target.scrollIntoView({ block: "start" });
                });
            }
            return;
        }
        const el = document.getElementById(`day-${dayKey}`);
        if (el === null) {
            return;
        }
        el.scrollIntoView({ block: "start" });
    }, [dayKey]);

    return null;
}
