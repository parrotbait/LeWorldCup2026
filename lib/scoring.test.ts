import { describe, expect, it } from "vitest";
import {
    BONUS_POINTS,
    DARK_HORSE_RUNNING_TOTAL,
    buildLeaderboard,
    computeBonusPointsByPlayer,
    darkHorsePoints,
    deriveDarkHorseStage,
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
        expect(BONUS_POINTS.PANTOMIME_VILLAIN).toBe(5);
        expect(BONUS_POINTS.SIEVE).toBe(5);
        expect(BONUS_POINTS.MIGHTY_FALLEN).toBe(8);
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

describe("deriveDarkHorseStage", () => {
    const teamId = 42;
    const matchTeam = (round: "GROUP" | "R32" | "R16" | "QF" | "SF" | "FINAL" | "THIRD") =>
        ({ round, homeTeamId: teamId, awayTeamId: 99 }) as const;

    it("OUT_IN_GROUPS when only group matches involve them", () => {
        expect(
            deriveDarkHorseStage(teamId, {
                matches: [matchTeam("GROUP"), matchTeam("GROUP"), matchTeam("GROUP")],
                winnerTeamIds: [],
            }),
        ).toBe("OUT_IN_GROUPS");
    });

    it("INTO_QF when team appears in QF but not later", () => {
        expect(
            deriveDarkHorseStage(teamId, {
                matches: [matchTeam("R32"), matchTeam("R16"), matchTeam("QF")],
                winnerTeamIds: [],
            }),
        ).toBe("INTO_QF");
    });

    it("INTO_FINAL when team played in the final but didn't win", () => {
        expect(
            deriveDarkHorseStage(teamId, {
                matches: [matchTeam("SF"), matchTeam("FINAL")],
                winnerTeamIds: [99],
            }),
        ).toBe("INTO_FINAL");
    });

    it("WON when listed as a winner", () => {
        expect(
            deriveDarkHorseStage(teamId, {
                matches: [matchTeam("FINAL")],
                winnerTeamIds: [teamId],
            }),
        ).toBe("WON");
    });
});

describe("computeBonusPointsByPlayer", () => {
    it("credits a tournament-winner pick", () => {
        const pts = computeBonusPointsByPlayer({
            picks: [
                { playerId: 1, kind: "WINNER", groupLetter: null, teamId: 7, playerName: null },
                { playerId: 2, kind: "WINNER", groupLetter: null, teamId: 8, playerName: null },
            ],
            resolutions: [
                { kind: "WINNER", groupLetter: "", teamIds: [7], playerNames: [] },
            ],
            matches: [],
        });
        expect(pts.get(1)).toBe(25);
        expect(pts.get(2)).toBeUndefined();
    });

    it("credits shared Golden Boot to anyone who picked any joint winner", () => {
        const pts = computeBonusPointsByPlayer({
            picks: [
                { playerId: 1, kind: "TOP_SCORER", groupLetter: null, teamId: null, playerName: "Mbappé" },
                { playerId: 2, kind: "TOP_SCORER", groupLetter: null, teamId: null, playerName: "kane" },
                { playerId: 3, kind: "TOP_SCORER", groupLetter: null, teamId: null, playerName: "Haaland" },
            ],
            resolutions: [
                { kind: "TOP_SCORER", groupLetter: "", teamIds: [], playerNames: ["Mbappé", "Kane"] },
            ],
            matches: [],
        });
        expect(pts.get(1)).toBe(10);
        expect(pts.get(2)).toBe(10);
        expect(pts.get(3)).toBeUndefined();
    });

    it("credits a group-winner pick only for the right group", () => {
        const pts = computeBonusPointsByPlayer({
            picks: [
                { playerId: 1, kind: "GROUP_WINNER", groupLetter: "A", teamId: 1, playerName: null },
                { playerId: 1, kind: "GROUP_WINNER", groupLetter: "B", teamId: 5, playerName: null },
            ],
            resolutions: [
                { kind: "GROUP_WINNER", groupLetter: "A", teamIds: [1], playerNames: [] },
                { kind: "GROUP_WINNER", groupLetter: "B", teamIds: [99], playerNames: [] },
            ],
            matches: [],
        });
        expect(pts.get(1)).toBe(BONUS_POINTS.GROUP_WINNER);
    });

    it("credits dark-horse points by furthest stage reached", () => {
        const pts = computeBonusPointsByPlayer({
            picks: [
                { playerId: 1, kind: "DARK_HORSE", groupLetter: null, teamId: 42, playerName: null },
            ],
            resolutions: [],
            matches: [
                { round: "GROUP", homeTeamId: 42, awayTeamId: 1 },
                { round: "R32", homeTeamId: 42, awayTeamId: 2 },
                { round: "R16", homeTeamId: 3, awayTeamId: 42 },
                { round: "QF", homeTeamId: 42, awayTeamId: 4 },
            ],
        });
        expect(pts.get(1)).toBe(DARK_HORSE_RUNNING_TOTAL.INTO_QF);
    });

    it("credits the anti-bonuses with their declared points", () => {
        const pts = computeBonusPointsByPlayer({
            picks: [
                { playerId: 1, kind: "PANTOMIME_VILLAIN", groupLetter: null, teamId: 5, playerName: null },
                { playerId: 1, kind: "SIEVE", groupLetter: null, teamId: 6, playerName: null },
                { playerId: 1, kind: "MIGHTY_FALLEN", groupLetter: null, teamId: 7, playerName: null },
            ],
            resolutions: [
                { kind: "PANTOMIME_VILLAIN", groupLetter: "", teamIds: [5], playerNames: [] },
                { kind: "SIEVE", groupLetter: "", teamIds: [6], playerNames: [] },
                { kind: "MIGHTY_FALLEN", groupLetter: "", teamIds: [7], playerNames: [] },
            ],
            matches: [],
        });
        expect(pts.get(1)).toBe(
            BONUS_POINTS.PANTOMIME_VILLAIN + BONUS_POINTS.SIEVE + BONUS_POINTS.MIGHTY_FALLEN,
        );
    });

    it("returns no points for picks with no matching resolution", () => {
        const pts = computeBonusPointsByPlayer({
            picks: [
                { playerId: 1, kind: "WINNER", groupLetter: null, teamId: 7, playerName: null },
            ],
            resolutions: [],
            matches: [],
        });
        expect(pts.get(1)).toBeUndefined();
    });
});
