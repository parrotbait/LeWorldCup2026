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

describe("predictionPoints — running scores during LIVE matches", () => {
    // football-data populates score.fullTime mid-match. We must not award
    // provisional points to predictions until the match is FINISHED.
    it("0 points for an exact-looking pick while the match is LIVE", () => {
        const m = { round: "GROUP" as const, status: "LIVE", homeScore: 2, awayScore: 1 };
        expect(predictionPoints(m, { homeScore: 2, awayScore: 1 })).toBe(0);
    });

    it("0 points for a correct-result pick while the match is LIVE", () => {
        const m = { round: "QF" as const, status: "LIVE", homeScore: 1, awayScore: 0 };
        expect(predictionPoints(m, { homeScore: 2, awayScore: 0 })).toBe(0);
    });

    it("isExact returns false on a LIVE match even when scores match", () => {
        const m = { homeScore: 2, awayScore: 1, status: "LIVE" };
        expect(isExact(m, { homeScore: 2, awayScore: 1 })).toBe(false);
    });

    it("FINISHED with the same scores does pay out", () => {
        const m = { round: "GROUP" as const, status: "FINISHED", homeScore: 2, awayScore: 1 };
        expect(predictionPoints(m, { homeScore: 2, awayScore: 1 })).toBe(4);
    });
});

describe("predictionPoints — knockout (AET-inclusive, pens ignored)", () => {
    // Scoring uses the score at the end of regulation + extra time. Penalty
    // shootouts are display-only. The DB's homeScore/awayScore is the
    // AET-final (or 90-min if no ET happened).

    it("90-min knockout, clear winner: 6 exact / 3 result / 0 miss", () => {
        const m = { round: "QF" as const, homeScore: 3, awayScore: 0 };
        expect(predictionPoints(m, { homeScore: 3, awayScore: 0 })).toBe(6);
        expect(predictionPoints(m, { homeScore: 2, awayScore: 1 })).toBe(3);
        expect(predictionPoints(m, { homeScore: 0, awayScore: 1 })).toBe(0);
    });

    it("AET shifted the score: exact bonus pays on AET-final, not 90-min", () => {
        // 90-min was 1-1, ET made it 2-2 (decided on pens).
        // homeScore/awayScore in DB = 2-2 (AET final).
        const m = { round: "QF" as const, homeScore: 2, awayScore: 2 };
        // 1-1 prediction is NOT exact — the final-for-scoring is 2-2.
        expect(predictionPoints(m, { homeScore: 1, awayScore: 1 })).toBe(3); // correct draw → result pts
        expect(predictionPoints(m, { homeScore: 2, awayScore: 2 })).toBe(6); // exact AET
    });

    it("knockout decided on pens after AET draw: a draw prediction earns result pts", () => {
        // 90-min 1-1, ET 1-1 (no goals in ET), pens decide.
        // We score on AET-final (1-1) and ignore pens entirely.
        const m = { round: "SF" as const, homeScore: 1, awayScore: 1 };
        expect(predictionPoints(m, { homeScore: 1, awayScore: 1 })).toBe(6); // exact
        expect(predictionPoints(m, { homeScore: 0, awayScore: 0 })).toBe(3); // wrong scoreline, right outcome
        expect(predictionPoints(m, { homeScore: 2, awayScore: 1 })).toBe(0); // home-win prediction misses
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
        expect(BONUS_POINTS.MOST_ASSISTS).toBe(10);
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
            { id: 10, round: "GROUP" as const, status: "FINISHED", homeScore: 2, awayScore: 1, homeTeamId: null, awayTeamId: null, winnerTeamId: null },
            // Both pick the same correct knockout result; Alice has joker on it → 3*2 = 6, Bob 3
            { id: 20, round: "QF" as const, status: "FINISHED", homeScore: 1, awayScore: 0, homeTeamId: null, awayTeamId: null, winnerTeamId: null },
            // Unsettled — should not contribute
            { id: 30, round: "SF" as const, status: "SCHEDULED", homeScore: null, awayScore: null, homeTeamId: null, awayTeamId: null, winnerTeamId: null },
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

    it("LIVE match with a running scoreline does not award points", () => {
        // Repro for the half-time scoreboard report (2026-06-16): a 2-1 pick
        // on a group game that's 2-1 at half-time must show 0 points and
        // 0 exact ticks, not 4 + 1 exact.
        const liveInput = {
            players: [
                { id: 1, displayName: "Alice", joinedAt: new Date(baseDate.getTime()) },
            ],
            matches: [
                {
                    id: 99,
                    round: "GROUP" as const,
                    status: "LIVE",
                    homeScore: 2,
                    awayScore: 1,
                    homeTeamId: null,
                    awayTeamId: null,
                    winnerTeamId: null,
                },
            ],
            predictions: [{ playerId: 1, matchId: 99, homeScore: 2, awayScore: 1 }],
            jokers: [],
            bonusPointsByPlayer: new Map<number, number>(),
        };
        const liveRows = buildLeaderboard(liveInput);
        expect(liveRows[0].points).toBe(0);
        expect(liveRows[0].exactCount).toBe(0);
    });
});

describe("buildLeaderboard tie-breakers", () => {
    const t = new Date("2026-05-01T00:00:00Z");
    const input = {
        players: [
            { id: 1, displayName: "Early", joinedAt: new Date(t.getTime()) },
            { id: 2, displayName: "Late", joinedAt: new Date(t.getTime() + 60_000) },
        ],
        matches: [{ id: 1, round: "GROUP" as const, status: "FINISHED", homeScore: 1, awayScore: 1, homeTeamId: null, awayTeamId: null, winnerTeamId: null }],
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

    it("Golden Boot match is diacritic- and whitespace-insensitive", () => {
        // Pick stored as "MBAPPÉ Kylian", admin-resolved as "Mbappe  Kylian" (no
        // accent, double-space). Both should still match.
        const pts = computeBonusPointsByPlayer({
            picks: [
                { playerId: 1, kind: "TOP_SCORER", groupLetter: null, teamId: null, playerName: "MBAPPÉ Kylian" },
                { playerId: 2, kind: "TOP_SCORER", groupLetter: null, teamId: null, playerName: "müller thomas" },
            ],
            resolutions: [
                {
                    kind: "TOP_SCORER",
                    groupLetter: "",
                    teamIds: [],
                    playerNames: ["Mbappe  Kylian", "MULLER Thomas"],
                },
            ],
            matches: [],
        });
        expect(pts.get(1)).toBe(10);
        expect(pts.get(2)).toBe(10);
    });

    it("credits MOST_ASSISTS to the single winner only", () => {
        const pts = computeBonusPointsByPlayer({
            picks: [
                { playerId: 1, kind: "MOST_ASSISTS", groupLetter: null, teamId: null, playerName: "DE BRUYNE Kevin" },
                { playerId: 2, kind: "MOST_ASSISTS", groupLetter: null, teamId: null, playerName: "MESSI Lionel" },
            ],
            resolutions: [
                {
                    kind: "MOST_ASSISTS",
                    groupLetter: "",
                    teamIds: [],
                    playerNames: ["DE BRUYNE Kevin"],
                },
            ],
            matches: [],
        });
        expect(pts.get(1)).toBe(10);
        expect(pts.get(2)).toBeUndefined();
    });

    it("credits MOST_ASSISTS to every player who picked any of a 3-way tie", () => {
        const pts = computeBonusPointsByPlayer({
            picks: [
                { playerId: 1, kind: "MOST_ASSISTS", groupLetter: null, teamId: null, playerName: "Bellingham Jude" },
                { playerId: 2, kind: "MOST_ASSISTS", groupLetter: null, teamId: null, playerName: "Højlund Rasmus" },
                { playerId: 3, kind: "MOST_ASSISTS", groupLetter: null, teamId: null, playerName: "Doué Désiré" },
                { playerId: 4, kind: "MOST_ASSISTS", groupLetter: null, teamId: null, playerName: "Foden Phil" },
            ],
            resolutions: [
                {
                    kind: "MOST_ASSISTS",
                    groupLetter: "",
                    teamIds: [],
                    // Diacritics on the tied list — every picker should still match via normalize.
                    playerNames: ["BELLINGHAM Jude", "HØJLUND Rasmus", "DOUÉ Désiré"],
                },
            ],
            matches: [],
        });
        expect(pts.get(1)).toBe(10);
        expect(pts.get(2)).toBe(10);
        expect(pts.get(3)).toBe(10);
        expect(pts.get(4)).toBeUndefined();
    });

    it("MOST_ASSISTS with no resolution → no points awarded", () => {
        const pts = computeBonusPointsByPlayer({
            picks: [
                { playerId: 1, kind: "MOST_ASSISTS", groupLetter: null, teamId: null, playerName: "Foden Phil" },
            ],
            resolutions: [],
            matches: [],
        });
        expect(pts.get(1)).toBeUndefined();
    });

    it("MOST_ASSISTS resolution with empty playerNames → no points, no crash", () => {
        const pts = computeBonusPointsByPlayer({
            picks: [
                { playerId: 1, kind: "MOST_ASSISTS", groupLetter: null, teamId: null, playerName: "Foden Phil" },
            ],
            resolutions: [
                { kind: "MOST_ASSISTS", groupLetter: "", teamIds: [], playerNames: [] },
            ],
            matches: [],
        });
        expect(pts.get(1)).toBeUndefined();
    });

    it("DARK_HORSE pays both pickers when the team-tie resolves to a shared advancer", () => {
        // Both players picked Senegal; admin set TWO winnerTeamIds (joint dark horses
        // for some reason — e.g. tied tournament finish). Both pickers paid full.
        const pts = computeBonusPointsByPlayer({
            picks: [
                { playerId: 1, kind: "DARK_HORSE", groupLetter: null, teamId: 7, playerName: null },
                { playerId: 2, kind: "DARK_HORSE", groupLetter: null, teamId: 8, playerName: null },
            ],
            resolutions: [],
            matches: [
                // Senegal (id 7) makes R32, eliminated.
                { round: "GROUP", homeTeamId: 7, awayTeamId: 99 },
                { round: "R32", homeTeamId: 7, awayTeamId: 99 },
                // Morocco (id 8) makes R32, eliminated — same stage.
                { round: "GROUP", homeTeamId: 8, awayTeamId: 99 },
                { round: "R32", homeTeamId: 8, awayTeamId: 99 },
            ],
        });
        expect(pts.get(1)).toBe(DARK_HORSE_RUNNING_TOTAL.INTO_R32);
        expect(pts.get(2)).toBe(DARK_HORSE_RUNNING_TOTAL.INTO_R32);
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
