"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import {
    LEADERBOARD_COLORS_LIGHT,
    colorForPlayerId,
    type LeaderboardColorMode,
} from "@/lib/leaderboard-colors";

type SnapshotPoint = {
    snapshotId: number;
    capturedAt: number;
    causeKind: "TOURNAMENT_START" | "MATCH" | "BONUS" | "CORRECTION";
    causeLabel: string;
    rowsByPlayerId: Record<
        number,
        {
            playerId: number;
            rank: number;
            points: number;
            bonusPoints: number;
            rankDelta: number;
            pointsDelta: number;
        }
    >;
};

export type RoundCutoffs = {
    R32: number | null;
    R16: number | null;
    QF: number | null;
    SF: number | null;
    FINAL: number | null;
};

/**
 * Range filter options. Round-based filters trim to snapshots from the first
 * match of that round onwards; time-based filters trim to a rolling window
 * ending now. "all" shows the entire dataset.
 *
 * The dropdown groups round options first, then a separator, then time
 * windows. URL value: ?range=<key>.
 */
type RangeKey = "all" | "r32" | "r16" | "qf" | "sf" | "final" | "7d" | "48h" | "24h";

const RANGE_LABELS: Record<RangeKey, string> = {
    all: "All time",
    r32: "Knockouts (≥R32)",
    r16: "≥ Round of 16",
    qf: "≥ Quarter-finals",
    sf: "≥ Semi-finals",
    final: "Final only",
    "7d": "Last 7 days",
    "48h": "Last 48 hours",
    "24h": "Last 24 hours",
};

const ROUND_RANGE_KEYS: ReadonlyArray<RangeKey> = ["r32", "r16", "qf", "sf", "final"];
const TIME_RANGE_KEYS: ReadonlyArray<RangeKey> = ["7d", "48h", "24h"];

const TIME_WINDOW_MS: Partial<Record<RangeKey, number>> = {
    "7d": 7 * 24 * 60 * 60 * 1000,
    "48h": 48 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
};

// Default visible range when no ?range= is present. Most leaderboard
// reads happen mid-tournament — "what just happened?" is the dominant
// question, so we default to the last 48h instead of the full history.
const DEFAULT_RANGE: RangeKey = "48h";

function isRangeKey(v: string | undefined): v is RangeKey {
    if (v === undefined) {
        return false;
    }
    return Object.prototype.hasOwnProperty.call(RANGE_LABELS, v);
}

interface Props {
    series: SnapshotPoint[];
    players: { id: number; displayName: string }[];
    currentPlayerId: number;
    roundCutoffs: RoundCutoffs;
    initialRange: string | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatUKDay(ms: number): string {
    const d = new Date(ms);
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

function formatTime(ms: number): string {
    const d = new Date(ms);
    const hh = d.getUTCHours().toString().padStart(2, "0");
    const mm = d.getUTCMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
}

export function LeaderboardChartClient({
    series,
    players,
    currentPlayerId,
    roundCutoffs,
    initialRange,
}: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Detect prefers-color-scheme on the client. Default to "light" during
    // SSR + initial hydration so the first paint isn't a guess; useEffect
    // upgrades to the actual mode and listens for OS-level changes (so
    // toggling theme system-wide live-updates the chart without reload).
    const [colorMode, setColorMode] = useState<LeaderboardColorMode>("light");
    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
            return;
        }
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        setColorMode(mq.matches ? "dark" : "light");
        const handler = (e: MediaQueryListEvent): void => {
            setColorMode(e.matches ? "dark" : "light");
        };
        mq.addEventListener("change", handler);
        return () => {
            mq.removeEventListener("change", handler);
        };
    }, []);

    const playerIds = useMemo(() => players.map((p) => p.id), [players]);
    const colourByPlayerId = useMemo(() => {
        const map = new Map<number, string>();
        for (const p of players) {
            map.set(p.id, colorForPlayerId(p.id, playerIds, colorMode));
        }
        return map;
    }, [players, playerIds, colorMode]);

    const [visiblePlayerIds, setVisiblePlayerIds] = useState<Set<number>>(
        () => new Set(playerIds),
    );

    const [range, setRange] = useState<RangeKey>(() =>
        isRangeKey(initialRange) ? initialRange : DEFAULT_RANGE,
    );

    function changeRange(next: RangeKey): void {
        setRange(next);
        // Persist in URL so the choice survives a refresh / share. The
        // default (DEFAULT_RANGE) is implicit — no param needed for it.
        const next_params = new URLSearchParams(searchParams.toString());
        if (next === DEFAULT_RANGE) {
            next_params.delete("range");
        } else {
            next_params.set("range", next);
        }
        // Always pin view=chart since the dropdown is only visible there.
        next_params.set("view", "chart");
        router.replace(`/leaderboard?${next_params.toString()}`, { scroll: false });
    }

    function togglePlayer(id: number): void {
        setVisiblePlayerIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    function showAll(): void {
        setVisiblePlayerIds(new Set(playerIds));
    }

    function justMe(): void {
        setVisiblePlayerIds(new Set([currentPlayerId]));
    }

    // Apply the range filter. For round filters, the cutoff is the first
    // kickoff of that round; for time filters, "now − window". Snapshots at
    // or after the cutoff are kept; everything before is collapsed into a
    // single synthetic baseline at the cutoff using the per-player state of
    // the snapshot immediately before, so the line has a starting position
    // at the chart's leftmost edge instead of starting mid-flight.
    const filteredSeries = useMemo<SnapshotPoint[]>(() => {
        if (range === "all" || series.length === 0) {
            return series;
        }
        let cutoff: number | null = null;
        if (range === "r32" || range === "r16" || range === "qf" || range === "sf" || range === "final") {
            const roundKey = range.toUpperCase() as keyof RoundCutoffs;
            cutoff = roundCutoffs[roundKey];
        } else {
            const window = TIME_WINDOW_MS[range];
            if (window !== undefined) {
                // Anchor to "now or later" so the filter behaves naturally
                // both in production (real wall-clock) and in sim, where
                // match kickoffs are stamped in the future relative to
                // Date.now() and would otherwise all fall within every
                // window. Using the latest snapshot when it's ahead of
                // wall-clock keeps the filter meaningful for sim runs.
                const lastCapturedAt = series[series.length - 1]!.capturedAt;
                const anchor = Math.max(Date.now(), lastCapturedAt);
                cutoff = anchor - window;
            }
        }
        if (cutoff === null) {
            // Round hasn't been drawn yet (or unknown range) — fall back to all.
            return series;
        }
        const inRange = series.filter((s) => s.capturedAt >= cutoff!);
        // Find the most recent snapshot strictly before the cutoff for the
        // baseline. Series is already sorted by capturedAt asc.
        let priorIndex = -1;
        for (let i = 0; i < series.length; i++) {
            if (series[i]!.capturedAt < cutoff!) {
                priorIndex = i;
            } else {
                break;
            }
        }
        if (priorIndex === -1) {
            // No prior — chart simply starts at the first in-range snapshot.
            return inRange;
        }
        const prior = series[priorIndex]!;
        // Synthetic snapshot: same per-player state as the prior, but
        // stamped at the cutoff and with deltas zeroed (so no ▲/▼ noise on
        // the baseline tooltip).
        const baseline: SnapshotPoint = {
            snapshotId: -1,
            capturedAt: cutoff,
            causeKind: "TOURNAMENT_START",
            causeLabel: `Range start — ${RANGE_LABELS[range]}`,
            rowsByPlayerId: Object.fromEntries(
                Object.values(prior.rowsByPlayerId).map((r) => [
                    r.playerId,
                    {
                        playerId: r.playerId,
                        rank: r.rank,
                        points: r.points,
                        bonusPoints: r.bonusPoints,
                        rankDelta: 0,
                        pointsDelta: 0,
                    },
                ]),
            ),
        };
        return [baseline, ...inRange];
    }, [series, range, roundCutoffs]);

    // Recharts data: one row per snapshot, with a `p_<playerId>` field per
    // player containing the rank. Recharts' Line dataKey reads from that.
    const chartData = useMemo(
        () =>
            filteredSeries.map((s) => {
                const row: Record<string, number | string> = {
                    capturedAt: s.capturedAt,
                    causeLabel: s.causeLabel,
                    causeKind: s.causeKind,
                };
                for (const p of players) {
                    const r = s.rowsByPlayerId[p.id];
                    if (r !== undefined) {
                        row[`p_${p.id}`] = r.rank;
                    }
                }
                return row;
            }),
        [filteredSeries, players],
    );

    // Day-tick selection: only label the first snapshot of each calendar day.
    const dayTicks = useMemo(() => {
        const seen = new Set<string>();
        const ticks: number[] = [];
        for (const s of filteredSeries) {
            const d = new Date(s.capturedAt);
            const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
            if (!seen.has(key)) {
                seen.add(key);
                ticks.push(s.capturedAt);
            }
        }
        return ticks;
    }, [filteredSeries]);

    // Snapshots indexed by capturedAt for the tooltip.
    const seriesByCapturedAt = useMemo(() => {
        const map = new Map<number, SnapshotPoint>();
        for (const s of filteredSeries) {
            map.set(s.capturedAt, s);
        }
        return map;
    }, [filteredSeries]);

    const playerById = useMemo(() => {
        const map = new Map<number, { id: number; displayName: string }>();
        for (const p of players) {
            map.set(p.id, p);
        }
        return map;
    }, [players]);

    const yMax = players.length;

    return (
        <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-wider">
                <button
                    type="button"
                    onClick={showAll}
                    className="font-display text-ink-muted hover:text-tournament"
                >
                    Show all
                </button>
                <span className="opacity-30">·</span>
                <button
                    type="button"
                    onClick={justMe}
                    className="font-display text-ink-muted hover:text-tournament"
                >
                    Just me
                </button>
                <span className="ml-auto inline-flex items-center gap-2">
                    <label
                        htmlFor="range-select"
                        className="font-display text-ink-muted"
                    >
                        Range
                    </label>
                    <select
                        id="range-select"
                        value={range}
                        onChange={(e) => changeRange(e.target.value as RangeKey)}
                        className="rounded border border-ink/30 bg-paper px-2 py-1 font-display text-[11px] uppercase tracking-wider text-ink hover:border-ink/60"
                    >
                        <option value="all">{RANGE_LABELS.all}</option>
                        {ROUND_RANGE_KEYS.map((k) => {
                            const cutoffKey = k.toUpperCase() as keyof RoundCutoffs;
                            const disabled = roundCutoffs[cutoffKey] === null;
                            return (
                                <option key={k} value={k} disabled={disabled}>
                                    {RANGE_LABELS[k]}
                                    {disabled ? " (not yet)" : ""}
                                </option>
                            );
                        })}
                        {/* HTML doesn't support real separators in <select>;
                            a disabled option with em-dashes is the canonical
                            workaround and reads as a divider in every UA. */}
                        <option disabled>──────────</option>
                        {TIME_RANGE_KEYS.map((k) => (
                            <option key={k} value={k}>
                                {RANGE_LABELS[k]}
                            </option>
                        ))}
                    </select>
                </span>
            </div>

            <div className="h-[60vh] min-h-[360px] w-full max-h-[640px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                        <CartesianGrid stroke="rgba(0,0,0,0.08)" />
                        <XAxis
                            dataKey="capturedAt"
                            type="number"
                            domain={["dataMin", "dataMax"]}
                            ticks={dayTicks}
                            tickFormatter={formatUKDay}
                            tick={{ fontSize: 11 }}
                            stroke="currentColor"
                        />
                        <YAxis
                            type="number"
                            reversed
                            domain={[1, yMax]}
                            ticks={Array.from({ length: yMax }, (_, i) => i + 1)}
                            allowDecimals={false}
                            tick={{ fontSize: 11 }}
                            stroke="currentColor"
                            width={28}
                        />
                        <Tooltip
                            content={
                                <ChartTooltip
                                    seriesByCapturedAt={seriesByCapturedAt}
                                    playerById={playerById}
                                    visiblePlayerIds={visiblePlayerIds}
                                    colourByPlayerId={colourByPlayerId}
                                    currentPlayerId={currentPlayerId}
                                />
                            }
                        />
                        {players.map((p) => {
                            if (!visiblePlayerIds.has(p.id)) {
                                return null;
                            }
                            const isMe = p.id === currentPlayerId;
                            const stroke = colourByPlayerId.get(p.id) ?? LEADERBOARD_COLORS_LIGHT[0]!;
                            return (
                                <Line
                                    key={p.id}
                                    type="monotone"
                                    dataKey={`p_${p.id}`}
                                    stroke={stroke}
                                    strokeWidth={isMe ? 2.5 : 1.5}
                                    strokeOpacity={isMe ? 1 : 0.4}
                                    isAnimationActive={false}
                                    dot={(dotProps: {
                                        cx?: number;
                                        cy?: number;
                                        payload?: { capturedAt: number };
                                        index?: number;
                                    }) => {
                                        const capturedAt = dotProps.payload?.capturedAt;
                                        const cx = dotProps.cx;
                                        const cy = dotProps.cy;
                                        if (
                                            capturedAt === undefined ||
                                            cx === undefined ||
                                            cy === undefined
                                        ) {
                                            return <g key={`dot-empty-${dotProps.index ?? 0}`} />;
                                        }
                                        const snap = seriesByCapturedAt.get(capturedAt);
                                        const row = snap?.rowsByPlayerId[p.id];
                                        // Only render a dot when something
                                        // actually moved for this player at
                                        // this snapshot.
                                        if (
                                            row === undefined ||
                                            (row.rankDelta === 0 && row.pointsDelta === 0)
                                        ) {
                                            return <g key={`dot-${p.id}-${capturedAt}`} />;
                                        }
                                        return (
                                            <circle
                                                key={`dot-${p.id}-${capturedAt}`}
                                                cx={cx}
                                                cy={cy}
                                                r={4}
                                                fill={stroke}
                                            />
                                        );
                                    }}
                                    activeDot={{ r: 6 }}
                                    connectNulls
                                />
                            );
                        })}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Chip-row legend. Horizontal scroll on narrow viewports. */}
            <div className="mt-3 -mx-6 overflow-x-auto px-6">
                <div className="flex w-max gap-2">
                    {players.map((p) => {
                        const visible = visiblePlayerIds.has(p.id);
                        const stroke = colourByPlayerId.get(p.id) ?? LEADERBOARD_COLORS_LIGHT[0]!;
                        const isMe = p.id === currentPlayerId;
                        return (
                            <button
                                type="button"
                                key={p.id}
                                onClick={() => togglePlayer(p.id)}
                                className={`flex items-center gap-2 whitespace-nowrap rounded border px-2 py-1 font-display text-[11px] uppercase tracking-wider transition-opacity ${
                                    visible
                                        ? "border-ink/40 text-ink"
                                        : "border-ink/15 text-ink-muted opacity-50"
                                }`}
                                aria-pressed={visible}
                            >
                                <span
                                    className="inline-block h-2 w-2 rounded-full"
                                    style={{ backgroundColor: stroke }}
                                />
                                <span>{p.displayName}</span>
                                {isMe ? <span className="text-[9px] opacity-60">(you)</span> : null}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function ChartTooltip({
    active,
    label,
    seriesByCapturedAt,
    playerById,
    visiblePlayerIds,
    colourByPlayerId,
    currentPlayerId,
}: {
    active?: boolean;
    label?: number;
    seriesByCapturedAt: Map<number, SnapshotPoint>;
    playerById: Map<number, { id: number; displayName: string }>;
    visiblePlayerIds: Set<number>;
    colourByPlayerId: Map<number, string>;
    currentPlayerId: number;
}) {
    if (active !== true || label === undefined) {
        return null;
    }
    const snap = seriesByCapturedAt.get(label);
    if (snap === undefined) {
        return null;
    }
    const day = formatUKDay(snap.capturedAt);
    const time = formatTime(snap.capturedAt);
    const visibleRows = Array.from(visiblePlayerIds)
        .map((pid) => {
            const row = snap.rowsByPlayerId[pid];
            const player = playerById.get(pid);
            if (row === undefined || player === undefined) {
                return null;
            }
            return { ...row, displayName: player.displayName };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => a.rank - b.rank);

    return (
        <div className="rounded border border-ink/40 bg-paper p-2 text-xs shadow-md">
            <div className="font-display text-[11px] uppercase tracking-wider text-tournament">
                {day} · {time} — {snap.causeLabel}
            </div>
            <div className="mt-1 space-y-0.5">
                {visibleRows.map((r) => {
                    const isMe = r.playerId === currentPlayerId;
                    const colour =
                        colourByPlayerId.get(r.playerId) ?? LEADERBOARD_COLORS_LIGHT[0]!;
                    const deltaText = renderDelta(r.rankDelta, r.pointsDelta);
                    return (
                        <div
                            key={r.playerId}
                            className={`flex items-center gap-2 px-1 ${isMe ? "bg-mustard/15" : ""}`}
                        >
                            <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: colour }}
                            />
                            <span className="flex-1 truncate">{r.displayName}</span>
                            <span className="font-mono opacity-70">#{r.rank}</span>
                            <span className="font-mono">{r.points} pts</span>
                            {deltaText !== null ? (
                                <span className="font-mono text-[10px] opacity-80">{deltaText}</span>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function renderDelta(rankDelta: number, pointsDelta: number): string | null {
    if (rankDelta === 0 && pointsDelta === 0) {
        return null;
    }
    const parts: string[] = [];
    if (rankDelta > 0) {
        parts.push(`▲${rankDelta}`);
    } else if (rankDelta < 0) {
        parts.push(`▼${Math.abs(rankDelta)}`);
    }
    if (pointsDelta !== 0) {
        parts.push(pointsDelta > 0 ? `+${pointsDelta}` : `${pointsDelta}`);
    }
    return parts.join(" ");
}
