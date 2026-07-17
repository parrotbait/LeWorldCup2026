import { describe, expect, it } from "vitest";
import {
    ALL_PERSONA_KEYS,
    FOOTBALLER_BY_PERSONA,
    allocatePersonas,
    buildWrapped,
    computeBoldness,
    computePlayerStats,
    findBestCall,
    findWorstCall,
    isTournamentComplete,
    isWrappedUnlocked,
    type PersonaInput,
    type WrappedInput,
} from "./wrapped";

describe("isTournamentComplete", () => {
    it("false when there is no FINAL match", () => {
        expect(isTournamentComplete([{ round: "SF", status: "FINISHED" }])).toBe(false);
    });

    it("false when the FINAL is not FINISHED", () => {
        expect(isTournamentComplete([{ round: "FINAL", status: "LIVE" }])).toBe(false);
    });

    it("true only when the FINAL is FINISHED", () => {
        expect(isTournamentComplete([{ round: "FINAL", status: "FINISHED" }])).toBe(true);
    });
});

describe("isWrappedUnlocked", () => {
    const finalDone = [{ round: "FINAL" as const, status: "FINISHED" }];
    const allRequired = [
        { kind: "WINNER" as const },
        { kind: "TOP_SCORER" as const },
        { kind: "MOST_ASSISTS" as const },
        { kind: "WOODEN_SPOON" as const },
        { kind: "PANTOMIME_VILLAIN" as const },
        { kind: "SIEVE" as const },
        { kind: "MIGHTY_FALLEN" as const },
    ];

    it("false when FINAL not finished, even if every bonus resolved", () => {
        const finalLive = [{ round: "FINAL" as const, status: "LIVE" }];
        expect(isWrappedUnlocked(finalLive, allRequired)).toBe(false);
    });

    it("false when FINAL finished but no bonuses resolved", () => {
        expect(isWrappedUnlocked(finalDone, [])).toBe(false);
    });

    it("false when a required bonus kind is still missing", () => {
        const missingMightyFallen = allRequired.filter((r) => r.kind !== "MIGHTY_FALLEN");
        expect(isWrappedUnlocked(finalDone, missingMightyFallen)).toBe(false);
    });

    it("true when FINAL finished and every required kind has a resolution row — empty teamIds counts", () => {
        expect(isWrappedUnlocked(finalDone, allRequired)).toBe(true);
    });

    it("does NOT wait on DARK_HORSE — scored per-pick, no resolution row is ever written", () => {
        expect(isWrappedUnlocked(finalDone, allRequired)).toBe(true);
    });

    it("waits on PANTOMIME_VILLAIN as an admin-controlled unlock switch", () => {
        const withoutPantomime = allRequired.filter((r) => r.kind !== "PANTOMIME_VILLAIN");
        expect(isWrappedUnlocked(finalDone, withoutPantomime)).toBe(false);
    });
});

describe("computePlayerStats", () => {
    const matches = [
        { id: 1, round: "GROUP" as const, status: "FINISHED", homeScore: 2, awayScore: 1,
          homeTeamId: 10, awayTeamId: 11, winnerTeamId: null, kickoff: new Date("2026-06-11T18:00:00Z"), groupLetter: "A" },
        { id: 2, round: "GROUP" as const, status: "FINISHED", homeScore: 0, awayScore: 0,
          homeTeamId: 12, awayTeamId: 13, winnerTeamId: null, kickoff: new Date("2026-06-12T18:00:00Z"), groupLetter: "B" },
    ];
    const predictions = [
        { playerId: 1, matchId: 1, homeScore: 2, awayScore: 1 }, // exact → 4
        { playerId: 1, matchId: 2, homeScore: 3, awayScore: 0 }, // wrong result → 0
        { playerId: 2, matchId: 1, homeScore: 1, awayScore: 0 }, // correct result → 2
    ];

    it("counts filed, exact, scored preds and participation", () => {
        const stats = computePlayerStats(1, { matches, predictions });
        expect(stats.filed).toBe(2);
        expect(stats.exactCount).toBe(1);
        expect(stats.scoredPreds).toBe(1);
        expect(stats.settledFinished).toBe(2);
        expect(stats.participationRate).toBe(1);
    });

    it("never divides by zero for a player who filed nothing", () => {
        const stats = computePlayerStats(999, { matches, predictions });
        expect(stats.filed).toBe(0);
        expect(stats.hitRate).toBe(0);
        expect(stats.exactRate).toBe(0);
        expect(stats.perMatchPoints).toBe(0);
        expect(Number.isNaN(stats.hitRate)).toBe(false);
    });
});

describe("best / worst call", () => {
    const matches = [
        { id: 1, round: "GROUP" as const, status: "FINISHED", homeScore: 2, awayScore: 1,
          homeTeamId: 10, awayTeamId: 11, winnerTeamId: null, kickoff: new Date("2026-06-11T18:00:00Z"), groupLetter: "A" },
        { id: 2, round: "GROUP" as const, status: "FINISHED", homeScore: 0, awayScore: 3,
          homeTeamId: 12, awayTeamId: 13, winnerTeamId: null, kickoff: new Date("2026-06-12T18:00:00Z"), groupLetter: "B" },
    ];
    const preds = [
        { playerId: 1, matchId: 1, homeScore: 2, awayScore: 1 }, // exact → best
        { playerId: 1, matchId: 2, homeScore: 3, awayScore: 0 }, // margin 6 → worst
    ];

    it("best call is the highest-scoring correct prediction", () => {
        const best = findBestCall(1, { matches, predictions: preds });
        expect(best?.matchId).toBe(1);
        expect(best?.points).toBe(4);
    });

    it("worst call is the biggest confidently-wrong miss", () => {
        const worst = findWorstCall(1, { matches, predictions: preds });
        expect(worst?.matchId).toBe(2);
        expect(worst?.missMargin).toBe(6);
    });

    it("no best call when player filed no scoring picks", () => {
        expect(findBestCall(999, { matches, predictions: preds })).toBeNull();
    });

    it("boldness is 0.5 when one of two filers shares your outcome (yourself)", () => {
        const all = [
            ...preds,
            { playerId: 2, matchId: 1, homeScore: 0, awayScore: 2 }, // AWAY, differs from player 1's HOME
        ];
        expect(computeBoldness(1, 1, all)).toBe(0.5);
    });
});

describe("allocatePersonas", () => {
    function player(id: number, over: Partial<PersonaInput>): PersonaInput {
        return {
            playerId: id,
            finalRank: id,
            lastRank: 3,
            participationRate: 1,
            filed: 20,
            exactCount: 0,
            perMatchPoints: 1,
            bonusPoints: 0,
            predPoints: 20,
            darkHorsePoints: 0,
            wonBonusWinner: false,
            knockoutCorrect: 0,
            knockoutPicks: 0,
            groupPointsShare: 0.5,
            meanPredGoals: 2,
            drawShare: 0.2,
            bestBoldness: 0,
            snapshotsLed: 0,
            rankClimb: 0,
            ...over,
        };
    }

    it("assigns reserved personas first: drop-out, champion, wooden spoon", () => {
        const players = [
            player(1, { finalRank: 1 }),
            player(2, { participationRate: 0.1, filed: 3 }),
            player(3, { finalRank: 3, lastRank: 3, participationRate: 1 }),
        ];
        const out = allocatePersonas(players);
        expect(out.get(1)).toBe("CHAMPION");
        expect(out.get(2)).toBe("EARLY_RETIREMENT");
        expect(out.get(3)).toBe("WOODEN_SPOON");
    });

    it("gives distinct personas to a full field (no duplicate allocatable)", () => {
        const players = Array.from({ length: 8 }, (_, i) =>
            player(i + 1, {
                finalRank: i + 2,
                lastRank: 20,
                exactCount: 8 - i,
                perMatchPoints: (8 - i) / 4,
            }),
        );
        const out = allocatePersonas(players);
        const assigned = [...out.values()];
        expect(new Set(assigned).size).toBe(assigned.length);
    });

    it("is deterministic — same input, same output", () => {
        const players = [player(1, { exactCount: 5 }), player(2, { exactCount: 5 })];
        expect([...allocatePersonas(players)]).toEqual([...allocatePersonas(players)]);
    });

    it("gives WOODEN_SPOON to the worst participating player, not a ghost at the bottom", () => {
        // Player 3 is dead last but stopped playing early — they're a ghost, not
        // a wooden-spooner. The spoon should slide up to player 2, the worst
        // still-playing finisher. Player 1 wins.
        const players = [
            player(1, { finalRank: 1, lastRank: 3, participationRate: 1 }),
            player(2, { finalRank: 2, lastRank: 3, participationRate: 1 }),
            player(3, { finalRank: 3, lastRank: 3, participationRate: 0.1, filed: 2 }),
        ];
        const out = allocatePersonas(players);
        expect(out.get(1)).toBe("CHAMPION");
        expect(out.get(3)).toBe("EARLY_RETIREMENT");
        expect(out.get(2)).toBe("WOODEN_SPOON");
    });

    it("gives BONUS_MERCHANT to the actual top bonus scorer, not a runner-up", () => {
        // Player 2 has the most bonusPoints (30) but ALSO the most darkHorsePoints (50).
        // The old greedy would pick DARK_HORSE_WHISPERER for player 2 first (score 50 >
        // 30), leaving BONUS_MERCHANT for player 3 (bonusPoints 15) — wrong.
        const players = [
            player(1, { finalRank: 1, lastRank: 4, participationRate: 1 }),
            player(2, { finalRank: 2, lastRank: 4, participationRate: 1, bonusPoints: 30, darkHorsePoints: 50 }),
            player(3, { finalRank: 3, lastRank: 4, participationRate: 1, bonusPoints: 15 }),
            player(4, { finalRank: 4, lastRank: 4, participationRate: 1 }),
        ];
        const out = allocatePersonas(players);
        expect(out.get(2)).toBe("BONUS_MERCHANT");
        expect(out.get(3)).not.toBe("BONUS_MERCHANT");
    });
});

describe("footballer mapping", () => {
    it("has exactly one footballer entry for every persona key", () => {
        for (const key of ALL_PERSONA_KEYS) {
            const entry = FOOTBALLER_BY_PERSONA[key];
            expect(entry, `missing footballer for ${key}`).toBeDefined();
            expect(entry.name.length).toBeGreaterThan(0);
            expect(entry.tie.length).toBeGreaterThan(0);
            expect(entry.sticker).toMatch(/^\/wrapped\/stickers\/.+\.png$/);
        }
    });
});

describe("buildWrapped", () => {
    const base: WrappedInput = {
        players: [
            { id: 1, displayName: "Winner", joinedAt: new Date("2026-01-01") },
            { id: 2, displayName: "Dropout", joinedAt: new Date("2026-01-02") },
        ],
        matches: [
            { id: 1, round: "GROUP", status: "FINISHED", homeScore: 2, awayScore: 1,
              homeTeamId: 10, awayTeamId: 11, winnerTeamId: null, kickoff: new Date("2026-06-11T18:00:00Z"), groupLetter: "A" },
            { id: 2, round: "FINAL", status: "FINISHED", homeScore: 1, awayScore: 0,
              homeTeamId: 10, awayTeamId: 12, winnerTeamId: 10, kickoff: new Date("2026-07-19T18:00:00Z"), groupLetter: null },
        ],
        predictions: [
            { playerId: 1, matchId: 1, homeScore: 2, awayScore: 1 },
            { playerId: 1, matchId: 2, homeScore: 1, awayScore: 0 },
            { playerId: 2, matchId: 1, homeScore: 0, awayScore: 0 },
        ],
        leaderboardRows: [
            { playerId: 1, displayName: "Winner", points: 10, exactCount: 2, bonusPoints: 0, knockoutResults: 1, joinedAt: new Date("2026-01-01") },
            { playerId: 2, displayName: "Dropout", points: 0, exactCount: 0, bonusPoints: 0, knockoutResults: 0, joinedAt: new Date("2026-01-02") },
        ],
        bonusBreakdownByPlayer: new Map(),
        snapshotSeries: [],
        teamLookup: new Map([
            [10, { name: "Spain", code: "ESP" }],
            [11, { name: "France", code: "FRA" }],
            [12, { name: "Brazil", code: "BRA" }],
        ]),
    };

    it("returns one WrappedData per player", () => {
        expect(buildWrapped(base).size).toBe(2);
    });

    it("winner gets CHAMPION and a footballer", () => {
        const w = buildWrapped(base).get(1)!;
        expect(w.persona).toBe("CHAMPION");
        expect(w.footballer.name).toBe("Lionel Messi");
    });

    it("low-data player is safe: no worst-call card, valid footballer", () => {
        const w = buildWrapped(base).get(2)!;
        expect(w.worstCall).toBeNull();
        expect(w.footballer.sticker).toMatch(/\.png$/);
        expect(w.playerId).toBe(2);
    });

    it("is deterministic", () => {
        expect([...buildWrapped(base)]).toEqual([...buildWrapped(base)]);
    });

    it("pitch + bonus always equals total, even when total includes joker points", () => {
        // Player 1's leaderboard total (13) exceeds their raw prediction sum (10)
        // — as happens with joker doubling. The card must still reconcile.
        const withJoker: WrappedInput = {
            ...base,
            leaderboardRows: [
                { playerId: 1, displayName: "Winner", points: 13, exactCount: 2, bonusPoints: 3, knockoutResults: 1, joinedAt: new Date("2026-01-01") },
                { playerId: 2, displayName: "Dropout", points: 0, exactCount: 0, bonusPoints: 0, knockoutResults: 0, joinedAt: new Date("2026-01-02") },
            ],
        };
        const w = buildWrapped(withJoker).get(1)!;
        expect(w.totalPoints).toBe(13);
        expect(w.bonusPoints).toBe(3);
        expect(w.predPoints + w.bonusPoints).toBe(w.totalPoints);
    });

    it("captures rankHistory in chronological order for the peak-card sparkline", () => {
        // Player 1 has 0 pts at t=1000 (skipped from history — pre-scoring),
        // then 4 pts at t=2000 (rank 1), then 7 pts at t=3000 (rank 2).
        const withSnaps: WrappedInput = {
            ...base,
            snapshotSeries: [
                { capturedAt: 1000, rowsByPlayerId: { 1: { rank: 3, points: 0 }, 2: { rank: 4, points: 0 } } },
                { capturedAt: 2000, rowsByPlayerId: { 1: { rank: 1, points: 4 }, 2: { rank: 4, points: 0 } } },
                { capturedAt: 3000, rowsByPlayerId: { 1: { rank: 2, points: 7 }, 2: { rank: 4, points: 0 } } },
            ],
        };
        const w = buildWrapped(withSnaps).get(1)!;
        expect(w.rankHistory).toEqual([
            { t: 2000, rank: 1 },
            { t: 3000, rank: 2 },
        ]);
        expect(w.peakRank).toBe(1);
    });

    it("ignores pre-scoring snapshots when computing peak — everyone is joint-#1 at 0 pts", () => {
        // Two early snapshots where the player sits at rank 1 with 0 points (the
        // "everyone tied" opening window), then real ranks emerge. The peak
        // should reflect the post-scoring window, not the meaningless #1.
        const withSnaps: WrappedInput = {
            ...base,
            snapshotSeries: [
                { capturedAt: 1000, rowsByPlayerId: { 1: { rank: 1, points: 0 }, 2: { rank: 1, points: 0 } } },
                { capturedAt: 2000, rowsByPlayerId: { 1: { rank: 1, points: 0 }, 2: { rank: 1, points: 0 } } },
                { capturedAt: 3000, rowsByPlayerId: { 1: { rank: 4, points: 3 }, 2: { rank: 2, points: 5 } } },
                { capturedAt: 4000, rowsByPlayerId: { 1: { rank: 3, points: 6 }, 2: { rank: 2, points: 6 } } },
            ],
        };
        const w = buildWrapped(withSnaps).get(1)!;
        // Sparkline history starts from the first post-scoring snapshot, not
        // the meaningless joint-#1 opening.
        expect(w.rankHistory).toEqual([
            { t: 3000, rank: 4 },
            { t: 4000, rank: 3 },
        ]);
        expect(w.peakRank).toBe(3);
    });
});
