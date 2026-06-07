"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { saveBonusResolutionAction } from "@/app/actions/admin";
import { flag } from "@/lib/utils";

interface RosterEntry {
    displayName: string;
    firstName: string;
    lastName: string;
    position: string;
    teamCode: string;
    teamName: string;
}

interface Props {
    kind: "TOP_SCORER" | "MOST_ASSISTS";
    label: string;
    description: string;
    points: string;
    initialNames: string[];
    roster: RosterEntry[];
}

function normalize(s: string): string {
    return s
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase();
}

const MAX_RESULTS = 8;

export function PlayerNameResolutionEditor({
    kind,
    label,
    description,
    points,
    initialNames,
    roster,
}: Props) {
    const [chips, setChips] = useState<RosterEntry[]>(() => {
        const out: RosterEntry[] = [];
        for (const n of initialNames) {
            const target = normalize(n);
            const found = roster.find((p) => normalize(p.displayName) === target);
            if (found !== undefined) {
                out.push(found);
            }
        }
        return out;
    });
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [, startTransition] = useTransition();
    const blurTimer = useRef<number | null>(null);

    const indexed = useMemo(
        () =>
            roster.map((p) => ({
                ...p,
                searchKey: normalize(`${p.displayName} ${p.firstName} ${p.lastName}`),
            })),
        [roster],
    );

    const matches = useMemo(() => {
        const q = normalize(query);
        if (q.length === 0) {
            return [] as typeof indexed;
        }
        const tokens = q.split(" ").filter(Boolean);
        const chosen = new Set(chips.map((c) => normalize(c.displayName)));
        const out: typeof indexed = [];
        for (const p of indexed) {
            if (chosen.has(normalize(p.displayName))) continue;
            let ok = true;
            for (const t of tokens) {
                if (!p.searchKey.includes(t)) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                out.push(p);
                if (out.length >= MAX_RESULTS) break;
            }
        }
        return out;
    }, [query, indexed, chips]);

    const persist = (next: RosterEntry[]): void => {
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("playerNames", next.map((c) => c.displayName).join(", "));
        setStatus("saving");
        startTransition(async () => {
            const res = await saveBonusResolutionAction(fd);
            setStatus(res.ok ? "saved" : "error");
        });
    };

    const add = (entry: RosterEntry): void => {
        const next = [...chips, entry];
        setChips(next);
        setQuery("");
        setOpen(false);
        persist(next);
    };

    const remove = (entry: RosterEntry): void => {
        const next = chips.filter((c) => normalize(c.displayName) !== normalize(entry.displayName));
        setChips(next);
        persist(next);
    };

    return (
        <section className="rounded border border-ink/15 p-4">
            <header className="flex items-baseline justify-between">
                <h3 className="font-display text-sm uppercase tracking-wider">{label}</h3>
                <span className="font-display text-xs text-tournament">{points}</span>
            </header>
            <p className="mt-1 text-xs opacity-60">{description}</p>

            {chips.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                    {chips.map((c) => (
                        <li
                            key={`${c.teamCode}:${c.displayName}`}
                            className="flex items-center gap-2 rounded-full border border-ink/30 bg-paper px-3 py-1 text-xs"
                        >
                            <span className="font-medium">{c.displayName}</span>
                            <span className="font-display text-[10px] uppercase opacity-60">
                                {c.teamCode}
                            </span>
                            <button
                                type="button"
                                onClick={() => remove(c)}
                                aria-label={`Remove ${c.displayName}`}
                                className="font-display text-[10px] uppercase opacity-60 hover:text-tournament"
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}

            <div className="relative mt-3">
                <input
                    type="text"
                    role="combobox"
                    aria-expanded={open && matches.length > 0}
                    aria-autocomplete="list"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => {
                        blurTimer.current = window.setTimeout(() => setOpen(false), 150);
                    }}
                    placeholder={
                        chips.length > 0
                            ? "Add another player (joint winners welcome)"
                            : "Search a player to set as winner"
                    }
                    className="w-full rounded border border-ink/30 bg-paper px-3 py-2 text-sm focus:border-tournament focus:outline-none"
                />
                {open && matches.length > 0 ? (
                    <ul
                        className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded border border-ink/40 shadow-xl ring-1 ring-ink/10"
                        style={{ backgroundColor: "var(--paper)", backgroundImage: "linear-gradient(rgba(0,0,0,0.04), rgba(0,0,0,0.04))" }}
                    >
                        {matches.map((p) => (
                            <li key={`${p.teamCode}:${p.displayName}`} className="border-b border-ink/10 last:border-b-0">
                                <button
                                    type="button"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        if (blurTimer.current !== null) {
                                            window.clearTimeout(blurTimer.current);
                                        }
                                        add(p);
                                    }}
                                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-ink/10"
                                >
                                    <span className="min-w-0 truncate font-medium">{p.displayName}</span>
                                    <span className="flex shrink-0 items-center gap-1.5 font-display text-[11px] uppercase opacity-70">
                                        <span className="text-base leading-none" aria-hidden>{flag(p.teamCode)}</span>
                                        <span>{p.teamCode}</span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </div>

            <div className="mt-2 h-4 text-[10px] uppercase tracking-wider">
                {status === "saving" ? (
                    <span className="opacity-60">saving…</span>
                ) : status === "saved" ? (
                    <span className="text-pitch">saved ✓</span>
                ) : status === "error" ? (
                    <span className="text-tournament">error</span>
                ) : null}
            </div>
        </section>
    );
}
