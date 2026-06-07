"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { saveBonusAction, type SaveResult } from "@/app/actions/picks";
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
    initialName: string | null;
    locked: boolean;
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

export function PlayerNameBonusPicker({
    kind,
    label,
    description,
    points,
    initialName,
    locked,
    roster,
}: Props) {
    const [query, setQuery] = useState(initialName ?? "");
    const [selected, setSelected] = useState<RosterEntry | null>(() => {
        if (initialName === null) {
            return null;
        }
        const target = normalize(initialName);
        return roster.find((p) => normalize(p.displayName) === target) ?? null;
    });
    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
        initialName !== null ? "saved" : "idle",
    );
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [, startTransition] = useTransition();
    const blurTimer = useRef<number | null>(null);

    // Pre-compute a search corpus per player. Cheap; ~1.2k entries.
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
        // Every token must appear somewhere in the searchKey. Cheap and good
        // enough for ~1.2k entries — no need for fuzzy fancy stuff.
        const out: typeof indexed = [];
        for (const p of indexed) {
            let ok = true;
            for (const t of tokens) {
                if (!p.searchKey.includes(t)) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                out.push(p);
                if (out.length >= MAX_RESULTS) {
                    break;
                }
            }
        }
        return out;
    }, [query, indexed]);

    const persist = (entry: RosterEntry): void => {
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("playerName", entry.displayName);
        setStatus("saving");
        startTransition(async () => {
            const res: SaveResult = await saveBonusAction(fd);
            if (res.ok) {
                setStatus("saved");
                setErrorMsg(null);
            } else {
                setStatus("error");
                setErrorMsg(res.error ?? "Couldn't save");
            }
        });
    };

    const choose = (entry: RosterEntry): void => {
        setSelected(entry);
        setQuery(entry.displayName);
        setOpen(false);
        persist(entry);
    };

    const clear = (): void => {
        setSelected(null);
        setQuery("");
        setStatus("idle");
        setErrorMsg(null);
    };

    return (
        <div className="rounded border border-ink/15 p-4">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-sm uppercase tracking-wider">{label}</h3>
                <span className="font-display text-xs text-tournament">{points}</span>
            </div>
            <p className="mt-1 text-xs opacity-60">{description}</p>

            <div className="relative mt-3">
                <input
                    type="text"
                    role="combobox"
                    aria-expanded={open && matches.length > 0}
                    aria-autocomplete="list"
                    disabled={locked}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                        if (selected !== null && normalize(e.target.value) !== normalize(selected.displayName)) {
                            setSelected(null);
                            setStatus("idle");
                        }
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => {
                        // Defer so a click on a result registers before we close.
                        blurTimer.current = window.setTimeout(() => setOpen(false), 150);
                    }}
                    placeholder="Search a player (e.g. Mbappe)"
                    className="w-full rounded border border-ink/30 bg-paper px-3 py-2 text-sm focus:border-tournament focus:outline-none disabled:opacity-60"
                />
                {selected !== null && !locked ? (
                    <button
                        type="button"
                        onClick={clear}
                        aria-label="Clear selection"
                        className="absolute right-2 top-1/2 -translate-y-1/2 font-display text-xs uppercase opacity-60 hover:text-tournament"
                    >
                        clear
                    </button>
                ) : null}

                {open && matches.length > 0 && !locked ? (
                    <ul
                        className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded border border-ink/40 shadow-xl ring-1 ring-ink/10"
                        style={{ backgroundColor: "var(--paper)", backgroundImage: "linear-gradient(rgba(0,0,0,0.04), rgba(0,0,0,0.04))" }}
                    >
                        {matches.map((p) => (
                            <li key={`${p.teamCode}:${p.displayName}`} className="border-b border-ink/10 last:border-b-0">
                                <button
                                    type="button"
                                    // onMouseDown beats onBlur of the input, so the click registers.
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        if (blurTimer.current !== null) {
                                            window.clearTimeout(blurTimer.current);
                                        }
                                        choose(p);
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

            <div className="mt-2 min-h-[16px] text-[10px] uppercase tracking-wider">
                {locked ? (
                    <span className="opacity-50">locked 🔒</span>
                ) : selected !== null ? (
                    <span className="opacity-70">
                        {selected.firstName} {selected.lastName} — {selected.teamName}
                    </span>
                ) : query.trim().length > 0 && matches.length === 0 ? (
                    <span className="text-tournament">No player matches “{query.trim()}”</span>
                ) : null}
            </div>

            <div className="mt-1 min-h-[14px] text-[10px] uppercase tracking-wider">
                {status === "saving" ? (
                    <span className="opacity-50">saving…</span>
                ) : status === "saved" && selected !== null ? (
                    <span className="text-pitch">saved ✓</span>
                ) : status === "error" ? (
                    <span className="text-tournament">{errorMsg}</span>
                ) : null}
            </div>
        </div>
    );
}
