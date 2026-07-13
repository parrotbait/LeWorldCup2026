import { describe, expect, it } from "vitest";
import {
    computePlayerStats,
    isTournamentComplete,
    isWrappedUnlocked,
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
