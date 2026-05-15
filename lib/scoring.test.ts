import { describe, expect, it } from "vitest";
import {
    BONUS_POINTS,
    DARK_HORSE_RUNNING_TOTAL,
    buildLeaderboard,
    darkHorsePoints,
    isExact,
    outcome,
    predictionPoints,
} from "./scoring";

describe("outcome", () => {
    it("classifies home win, away win, draw", () => {
        expect(outcome({ homeScore: 2, awayScore: 1 })).toBe("HOME");
        expect(outcome({ homeScore: 0, awayScore: 3 })).toBe("AWAY");
        expect(outcome({ homeScore: 1, awayScore: 1 })).toBe("DRAW");
    });
});

describe("predictionPoints — group stage", () => {
    const m = { round: "GROUP" as const, homeScore: 2, awayScore: 1 };

    it("0 if no prediction", () => {
        expect(predictionPoints(m, undefined)).toBe(0);
    });

    it("0 if match unsettled", () => {
        expect(
            predictionPoints(
                { round: "GROUP", homeScore: null, awayScore: null },
                { homeScore: 2, awayScore: 1 },
            ),
        ).toBe(0);
    });

    it("4 for exact score", () => {
        expect(predictionPoints(m, { homeScore: 2, awayScore: 1 })).toBe(4);
    });

    it("2 for correct result, wrong score", () => {
        expect(predictionPoints(m, { homeScore: 3, awayScore: 0 })).toBe(2);
    });

    it("0 for wrong result", () => {
        expect(predictionPoints(m, { homeScore: 1, awayScore: 2 })).toBe(0);
    });

    it("draw — exact draw scores 4", () => {
        const drawMatch = { round: "GROUP" as const, homeScore: 1, awayScore: 1 };
        expect(predictionPoints(drawMatch, { homeScore: 1, awayScore: 1 })).toBe(4);
        expect(predictionPoints(drawMatch, { homeScore: 0, awayScore: 0 })).toBe(2);
    });
});

describe("predictionPoints — knockout", () => {
    const m = { round: "QF" as const, homeScore: 3, awayScore: 0 };
    it("6 for exact", () => {
        expect(predictionPoints(m, { homeScore: 3, awayScore: 0 })).toBe(6);
    });
    it("3 for result", () => {
        expect(predictionPoints(m, { homeScore: 2, awayScore: 1 })).toBe(3);
    });
    it("0 for miss", () => {
        expect(predictionPoints(m, { homeScore: 0, awayScore: 1 })).toBe(0);
    });
});

describe("isExact", () => {
    it("true only when scores match exactly", () => {
        expect(isExact({ homeScore: 2, awayScore: 1 }, { homeScore: 2, awayScore: 1 })).toBe(true);
        expect(isExact({ homeScore: 2, awayScore: 1 }, { homeScore: 1, awayScore: 2 })).toBe(false);
        expect(isExact({ homeScore: null, awayScore: 1 }, { homeScore: 0, awayScore: 1 })).toBe(false);
    });
});

describe("dark-horse staging", () => {
    it("matches the spec table", () => {
        expect(darkHorsePoints("OUT_IN_GROUPS")).toBe(0);
        expect(darkHorsePoints("INTO_R32")).toBe(2);
        expect(darkHorsePoints("INTO_R16")).toBe(6);
        expect(darkHorsePoints("INTO_QF")).toBe(12);
        expect(darkHorsePoints("INTO_SF")).toBe(22);
        expect(darkHorsePoints("INTO_FINAL")).toBe(37);
        expect(darkHorsePoints("WON")).toBe(57);
    });

    it("max dark horse equals doc total of 57", () => {
        expect(DARK_HORSE_RUNNING_TOTAL.WON).toBe(57);
    });
});

describe("BONUS_POINTS sanity", () => {
    it("matches the published values", () => {
        expect(BONUS_POINTS.WINNER).toBe(25);
        expect(BONUS_POINTS.TOP_SCORER).toBe(10);
        expect(BONUS_POINTS.GROUP_WINNER).toBe(3);
        expect(BONUS_POINTS.WOODEN_SPOON).toBe(5);
        expect(BONUS_POINTS.FIRST_GOAL_SCORER).toBe(5);
    });
});

describe("buildLeaderboard", () => {
    const baseDate = new Date("2026-05-01T00:00:00Z");
    const input = {
        players: [
            { id: 1, displayName: "Alice", joinedAt: new Date(baseDate.getTime()) },
            { id: 2, displayName: "Bob", joinedAt: new Date(baseDate.getTime() + 1000) },
        ],
        matches: [
            // Alice nails an exact group match → 4 pts
            { id: 10, round: "GROUP" as const, homeScore: 2, awayScore: 1 },
            // Both pick the same correct knockout result; Alice has joker on it → 3*2 = 6, Bob 3
            { id: 20, round: "QF" as const, homeScore: 1, awayScore: 0 },
            // Unsettled — should not contribute
            { id: 30, round: "SF" as const, homeScore: null, awayScore: null },
        ],
        predictions: [
            { playerId: 1, matchId: 10, homeScore: 2, awayScore: 1 },
            { playerId: 2, matchId: 10, homeScore: 3, awayScore: 0 }, // result only
            { playerId: 1, matchId: 20, homeScore: 2, awayScore: 1 },
            { playerId: 2, matchId: 20, homeScore: 1, awayScore: 0 }, // exact
            { playerId: 1, matchId: 30, homeScore: 1, awayScore: 1 },
        ],
        jokers: [{ playerId: 1, round: "QF" as const, matchId: 20 }],
        bonusPointsByPlayer: new Map<number, number>([
            [1, 5],
            [2, 0],
        ]),
    };

    const rows = buildLeaderboard(input);

    it("computes points with joker doubling", () => {
        // Alice: 4 (exact group) + 3*2 (joker on QF result) + 5 (bonus) = 15
        // Bob:   2 (group result) + 6 (exact QF) + 0 = 8
        expect(rows[0].displayName).toBe("Alice");
        expect(rows[0].points).toBe(15);
        expect(rows[1].displayName).toBe("Bob");
        expect(rows[1].points).toBe(8);
    });

    it("counts exact predictions for tie-break", () => {
        const alice = rows.find((r) => r.displayName === "Alice")!;
        const bob = rows.find((r) => r.displayName === "Bob")!;
        expect(alice.exactCount).toBe(1);
        expect(bob.exactCount).toBe(1);
    });

    it("ignores predictions on unsettled matches", () => {
        // Alice predicted match 30 but homeScore is null — points should be 15 not anything more.
        expect(rows[0].points).toBe(15);
    });
});

describe("buildLeaderboard tie-breakers", () => {
    const t = new Date("2026-05-01T00:00:00Z");
    const input = {
        players: [
            { id: 1, displayName: "Early", joinedAt: new Date(t.getTime()) },
            { id: 2, displayName: "Late", joinedAt: new Date(t.getTime() + 60_000) },
        ],
        matches: [{ id: 1, round: "GROUP" as const, homeScore: 1, awayScore: 1 }],
        predictions: [
            { playerId: 1, matchId: 1, homeScore: 1, awayScore: 1 }, // 4
            { playerId: 2, matchId: 1, homeScore: 1, awayScore: 1 }, // 4
        ],
        jokers: [],
        bonusPointsByPlayer: new Map<number, number>(),
    };

    it("falls through to earliest signup when all earlier metrics tie", () => {
        const rows = buildLeaderboard(input);
        expect(rows[0].displayName).toBe("Early");
        expect(rows[1].displayName).toBe("Late");
    });
});
