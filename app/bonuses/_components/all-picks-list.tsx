import Link from "next/link";
import { flag } from "@/lib/utils";

export interface AllPicksGroup {
    /** Display label of the picked subject — team name or player name. */
    label: string;
    /** Optional team code so we can render a flag for team picks. */
    teamCode?: string;
    /** Players who picked this subject, sorted for stable rendering. */
    pickers: Array<{ playerId: number; displayName: string; isMe: boolean }>;
}

interface Props {
    groups: AllPicksGroup[];
}

/**
 * Renders every player's bonus pick for a single category, grouped by the
 * subject picked. Most-popular pick first. The category card already shows
 * the live leader; this block answers "what did everyone go for?".
 */
export function AllPicksList({ groups }: Props) {
    if (groups.length === 0) {
        return (
            <p className="mt-3 font-display text-[11px] uppercase tracking-wider opacity-40">
                no picks filed
            </p>
        );
    }

    return (
        <div className="mt-3 border-t border-ink/10 pt-2">
            <p className="font-display text-[10px] uppercase tracking-[0.25em] opacity-50">
                All picks
            </p>
            <ul className="mt-1.5 space-y-1.5 text-xs">
                {groups.map((g) => (
                    <li
                        key={g.label}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                    >
                        <span className="font-medium">
                            {g.teamCode !== undefined ? (
                                <span className="mr-1" aria-hidden>
                                    {flag(g.teamCode)}
                                </span>
                            ) : null}
                            {g.label}
                        </span>
                        <span className="opacity-40">×{g.pickers.length}</span>
                        <span className="opacity-70">
                            {g.pickers.map((p, i) => (
                                <span key={p.playerId}>
                                    {i > 0 ? <span className="opacity-40">, </span> : null}
                                    <Link
                                        href={`/players/${p.playerId}` as never}
                                        className="hover:text-tournament hover:underline"
                                    >
                                        {p.displayName}
                                        {p.isMe ? (
                                            <span className="ml-0.5 opacity-50">(you)</span>
                                        ) : null}
                                    </Link>
                                </span>
                            ))}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
