"use client";

import { useEffect } from "react";

/**
 * Scrolls the named day section into view on mount. Used to land the user on
 * today's (or the next upcoming) matchday when they open the predictions page,
 * so they don't have to scroll past finished games on mobile.
 */
export function ScrollToDay({ dayKey }: { dayKey: string }) {
    useEffect(() => {
        const el = document.getElementById(`day-${dayKey}`);
        if (el === null) {
            return;
        }
        el.scrollIntoView({ block: "start" });
    }, [dayKey]);

    return null;
}
