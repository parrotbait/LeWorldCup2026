"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/actions/auth";

interface Tab {
    href: string;
    label: string;
    /** Path prefixes (besides href) that should keep this tab marked active. */
    activeWhen?: string[];
}

const PRIMARY_TABS: Tab[] = [
    { href: "/today", label: "Today" },
    { href: "/leaderboard", label: "Standings" },
    { href: "/predictions", label: "Picks" },
    { href: "/bonuses", label: "Bonuses" },
];

const MORE_LINKS: Tab[] = [
    { href: "/matches", label: "All matches" },
    { href: "/stats", label: "Stats" },
    { href: "/me", label: "My profile", activeWhen: ["/players/"] },
    { href: "/rules", label: "Rules" },
];

interface Props {
    displayName: string;
}

export function MobileTabBar({ displayName }: Props) {
    const pathname = usePathname() ?? "";
    const [moreOpen, setMoreOpen] = useState(false);

    // Close the sheet on route changes — without this, tapping a More entry
    // navigates but the backdrop lingers behind the new page on slow nav.
    useEffect(() => {
        setMoreOpen(false);
    }, [pathname]);

    const isActive = (tab: Tab): boolean => {
        if (pathname === tab.href) {
            return true;
        }
        const prefixes = tab.activeWhen ?? [];
        return prefixes.some((p) => pathname.startsWith(p));
    };

    // The "More" tab is active whenever none of the primary tabs match — that
    // way Stats / Matches / Profile / Rules visibly belong to the More group.
    const moreActive = !PRIMARY_TABS.some((t) => isActive(t));

    return (
        <>
            <nav
                aria-label="Primary navigation"
                className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)] md:hidden"
            >
                <ul className="grid grid-cols-5">
                    {PRIMARY_TABS.map((tab) => {
                        const active = isActive(tab);
                        return (
                            <li key={tab.href}>
                                <Link
                                    href={tab.href as never}
                                    className={`flex h-14 items-center justify-center text-center font-display text-[11px] uppercase tracking-wider ${
                                        active ? "text-tournament" : "text-ink-muted"
                                    }`}
                                >
                                    {tab.label}
                                </Link>
                            </li>
                        );
                    })}
                    <li>
                        <button
                            type="button"
                            onClick={() => setMoreOpen(true)}
                            aria-haspopup="dialog"
                            aria-expanded={moreOpen}
                            className={`flex h-14 w-full items-center justify-center text-center font-display text-[11px] uppercase tracking-wider ${
                                moreActive ? "text-tournament" : "text-ink-muted"
                            }`}
                        >
                            More
                        </button>
                    </li>
                </ul>
            </nav>

            {moreOpen ? (
                <div
                    className="fixed inset-0 z-40 md:hidden"
                    role="dialog"
                    aria-modal="true"
                    aria-label="More navigation"
                >
                    <button
                        type="button"
                        aria-label="Close menu"
                        onClick={() => setMoreOpen(false)}
                        className="absolute inset-0 bg-ink/40"
                    />
                    <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)] shadow-xl">
                        <div className="flex items-center justify-between border-b border-rule/60 px-5 py-3">
                            <span className="font-display text-xs uppercase tracking-[0.25em] opacity-60">
                                {displayName}
                            </span>
                            <button
                                type="button"
                                onClick={() => setMoreOpen(false)}
                                className="font-display text-xs uppercase tracking-wider text-ink-muted"
                            >
                                Close
                            </button>
                        </div>
                        <ul className="divide-y divide-rule/60">
                            {MORE_LINKS.map((link) => {
                                const active = isActive(link);
                                return (
                                    <li key={link.href}>
                                        <Link
                                            href={link.href as never}
                                            className={`flex items-center justify-between px-5 py-4 font-display text-sm uppercase tracking-wider ${
                                                active ? "text-tournament" : "text-ink"
                                            }`}
                                        >
                                            <span>{link.label}</span>
                                            <span aria-hidden className="opacity-40">
                                                ›
                                            </span>
                                        </Link>
                                    </li>
                                );
                            })}
                            <li>
                                <form action={logoutAction}>
                                    <button
                                        type="submit"
                                        className="flex w-full items-center justify-between px-5 py-4 text-left font-display text-sm uppercase tracking-wider text-ink-muted"
                                    >
                                        <span>Log out</span>
                                        <span aria-hidden className="opacity-40">
                                            ›
                                        </span>
                                    </button>
                                </form>
                            </li>
                        </ul>
                    </div>
                </div>
            ) : null}
        </>
    );
}
