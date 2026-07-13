"use client";

import type { WrappedData } from "@/lib/wrapped";

// Temporary stub — replaced by the full card-story modal in the next task.
export function WrappedModalClient({ data, autoOpen }: { data: WrappedData; autoOpen: boolean }) {
    return (
        <div className="mt-4 text-xs opacity-60">
            Wrapped ready for {data.displayName} (autoOpen={String(autoOpen)}) — modal coming next.
        </div>
    );
}
