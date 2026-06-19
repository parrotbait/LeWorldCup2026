import Link from "next/link";

/**
 * Segmented control between the table and chart views of the leaderboard.
 *
 * The active view is encoded in the `?view=` query param so it survives
 * refresh and can be linked-to. Defaults to table when absent.
 */
export function ViewToggle({ active }: { active: "table" | "chart" }) {
    const baseClass =
        "border px-3 py-1 font-display text-xs uppercase tracking-wider transition-colors";
    const activeClass = "border-tournament text-tournament bg-tournament/10";
    const inactiveClass = "border-ink/30 text-ink-muted hover:border-ink/60 hover:text-ink";

    return (
        <div className="mt-2 inline-flex" role="tablist" aria-label="Leaderboard view">
            <Link
                href="/leaderboard"
                role="tab"
                aria-selected={active === "table"}
                className={`${baseClass} -mr-px ${active === "table" ? activeClass : inactiveClass}`}
            >
                Table
            </Link>
            <Link
                href="/leaderboard?view=chart"
                role="tab"
                aria-selected={active === "chart"}
                className={`${baseClass} ${active === "chart" ? activeClass : inactiveClass}`}
            >
                Chart
            </Link>
        </div>
    );
}
