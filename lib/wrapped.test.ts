import { describe, expect, it } from "vitest";
import {
    allocatePersonas,
    computeBoldness,
    computePlayerStats,
    findBestCall,
    findWorstCall,
    isTournamentComplete,
    isWrappedUnlocked,
    type PersonaInput,
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

    it("false when FINAL finished but no WINNER resolution", () => {
        expect(isWrappedUnlocked(finalDone, [])).toBe(false);
    });

    it("false when a WINNER resolution row exists but has no team", () => {
        expect(
            isWrappedUnlocked(finalDone, [
                { kind: "WINNER", groupLetter: "", teamIds: [], playerNames: [] },
            ]),
        ).toBe(false);
    });

    it("true when FINAL finished AND WINNER resolution has a team", () => {
        expect(
            isWrappedUnlocked(finalDone, [
                { kind: "WINNER", groupLetter: "", teamIds: [7], playerNames: [] },
            ]),
        ).toBe(true);
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
});
