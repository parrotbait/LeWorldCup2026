import type { LiveLeader } from "@/lib/live-leaders";
import { flag } from "@/lib/utils";

interface Props {
    leader: LiveLeader;
    /** Plural noun used in tied-many copy ("players" or "teams"). Defaults to "players". */
    subjectPlural?: "players" | "teams";
    /** Optional metric label appended after the leader name, e.g. "5 goals" or "3 assists". */
    metricLabel?: (n: number) => string;
    /** When true, displays "winner:" instead of "currently:" and uses a resolved style. */
    finalized?: boolean;
}

export function LiveLeaderChip({ leader, subjectPlural = "players", metricLabel, finalized = false }: Props) {
    if (leader.kind === "hidden") {
        return null;
    }

    const baseClass = "mt-2 font-display text-[11px] uppercase tracking-wider";
    const prefix = finalized ? "winner:" : "currently:";
    const prefixClass = finalized ? "opacity-50" : "opacity-50";
    const resolvedBadge = finalized ? (
        <span className="ml-2 rounded bg-emerald-700/20 px-1.5 py-0.5 text-[9px] text-emerald-700">
            resolved
        </span>
    ) : null;

    if (leader.kind === "unavailable") {
        const reason =
            leader.reason === "cards_not_in_free_tier"
                ? "data n/a (cards source)"
                : leader.reason === "assists_not_in_free_tier"
                  ? "data n/a (assists source)"
                  : leader.reason === "fd_fetch_failed"
                    ? "couldn’t load live stats"
                    : "data n/a";
        return (
            <p className={`${baseClass} opacity-40`}>
                <span className="opacity-60">{prefix}</span> {reason}
            </p>
        );
    }

    const metric =
        metricLabel !== undefined ? <span className="ml-1 opacity-50">· {metricLabel(leader.kind === "tied-many" ? leader.metric : leader.metric)}</span> : null;

    if (leader.kind === "single") {
        return (
            <p className={baseClass}>
                <span className={prefixClass}>{prefix}</span>{" "}
                {leader.teamCode !== undefined ? (
                    <span className="mr-1" aria-hidden>{flag(leader.teamCode)}</span>
                ) : null}
                <span className="font-medium normal-case tracking-normal">{leader.displayName}</span>
                {metric}
                {resolvedBadge}
            </p>
        );
    }

    if (leader.kind === "tied-pair") {
        return (
            <p className={baseClass}>
                <span className={prefixClass}>{prefix}</span>{" "}
                <span className="font-medium normal-case tracking-normal">
                    {leader.names[0]}
                </span>{" "}
                <span className="opacity-50">&amp;</span>{" "}
                <span className="font-medium normal-case tracking-normal">
                    {leader.names[1]}
                </span>
                {metric}
                {resolvedBadge}
            </p>
        );
    }

    return (
        <p className={baseClass}>
            <span className={prefixClass}>{prefix}</span>{" "}
            <span className="font-medium normal-case tracking-normal">
                {leader.count} {leader.subjectPlural ?? subjectPlural} tied
            </span>
            {metric}
            {resolvedBadge}
        </p>
    );
}
