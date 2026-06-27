"use client";

import { useState } from "react";

interface AuditEntry {
    id: number;
    at: Date;
    actor: string;
    action: string;
    detail: string | null;
}

interface Props {
    entries: AuditEntry[];
    errorEntries: AuditEntry[];
}

function formatDetail(detail: string | null): React.ReactNode {
    if (detail === null) {
        return null;
    }
    try {
        const parsed = JSON.parse(detail);

        const parts: string[] = [];

        if (parsed.regressionDetected) {
            parts.push("⚠️ REGRESSION");
        }
        if (Array.isArray(parsed.regressions) && parsed.regressions.length > 0) {
            const names = parsed.regressions
                .map((r: { displayName: string; pointsDelta: number }) => `${r.displayName} ${r.pointsDelta}`)
                .join(", ");
            parts.push(`Regressions: ${names}`);
        }
        if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
            parts.push(`Errors: ${parsed.errors.join("; ")}`);
        }
        if (Array.isArray(parsed.matchErrors) && parsed.matchErrors.length > 0) {
            parts.push(`Match errors (${parsed.matchErrors.length})`);
        }
        if (Array.isArray(parsed.matchDiffs) && parsed.matchDiffs.length > 0) {
            const diffs = parsed.matchDiffs
                .slice(0, 5)
                .map((d: { label: string; oldScore: string | null; newScore: string | null; oldStatus: string; newStatus: string }) => {
                    if (d.oldScore !== d.newScore) {
                        return `${d.label}: ${d.oldScore ?? "—"} → ${d.newScore ?? "—"}`;
                    }
                    return `${d.label}: ${d.oldStatus} → ${d.newStatus}`;
                })
                .join("; ");
            const more = parsed.matchDiffs.length > 5 ? ` (+${parsed.matchDiffs.length - 5} more)` : "";
            parts.push(`Diffs: ${diffs}${more}`);
        }
        if (parsed.durationMs !== undefined) {
            parts.push(`${parsed.durationMs}ms`);
        }

        if (parts.length > 0) {
            return parts.join(" · ");
        }

        if (detail.length > 120) {
            return detail.slice(0, 120) + "…";
        }
        return detail;
    } catch {
        if (detail.length > 120) {
            return detail.slice(0, 120) + "…";
        }
        return detail;
    }
}

export function AuditLogSection({ entries, errorEntries }: Props) {
    const [filter, setFilter] = useState<"all" | "errors">("all");
    const visible = filter === "errors" ? errorEntries : entries;

    return (
        <section className="mt-10">
            <div className="flex items-baseline gap-4">
                <h2 className="font-display text-sm uppercase tracking-wider">Recent activity</h2>
                <div className="flex gap-2 text-xs">
                    <button
                        type="button"
                        onClick={() => {
                            setFilter("all");
                        }}
                        className={`rounded px-2 py-0.5 ${filter === "all" ? "bg-ink text-paper" : "opacity-60 hover:opacity-100"}`}
                    >
                        All ({entries.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setFilter("errors");
                        }}
                        className={`rounded px-2 py-0.5 ${filter === "errors" ? "bg-tournament text-paper" : errorEntries.length > 0 ? "text-tournament hover:opacity-80" : "opacity-60 hover:opacity-100"}`}
                    >
                        Errors ({errorEntries.length})
                    </button>
                </div>
            </div>
            <ul className="mt-3 divide-y divide-ink/15 text-sm">
                {visible.length === 0 ? (
                    <li className="py-4 text-xs opacity-60">
                        {filter === "errors" ? "No errors — all clear." : "No log entries yet."}
                    </li>
                ) : (
                    visible.map((l) => (
                        <li key={l.id} className="py-2">
                            <div className="flex items-baseline gap-3">
                                <span className="w-40 shrink-0 font-display text-xs opacity-50">
                                    {l.at.toISOString().replace("T", " ").slice(0, 19)}
                                </span>
                                <span className="w-20 shrink-0 font-display text-xs uppercase opacity-70">
                                    {l.actor}
                                </span>
                                <span className="font-medium">{l.action}</span>
                            </div>
                            {l.detail !== null ? (
                                <div className="mt-1 pl-[calc(10rem+5rem+1.5rem)] text-xs opacity-60 break-words">
                                    {formatDetail(l.detail)}
                                </div>
                            ) : null}
                        </li>
                    ))
                )}
            </ul>
        </section>
    );
}
