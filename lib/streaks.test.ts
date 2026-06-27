import { describe, expect, it } from "vitest";
import { computeStreaks, streakFlames } from "./streaks";

function makeMatch(id: number, kickoff: string, home: number, away: number) {
    return {
        id,
        kickoff: new Date(kickoff),
        round: "GROUP" as const,
        status: "FINISHED" as const,
        homeScore: home,
        awayScore: away,
        homeTeamId: 1,
        awayTeamId: 2,
        winnerTeamId: home > away ? 1 : away > home ? 2 : null,
    };
}

describe("computeStreaks", () => {
    const matches = [
        makeMatch(1, "2026-06-15T15:00:00Z", 2, 1),
        makeMatch(2, "2026-06-16T15:00:00Z", 0, 0),
        makeMatch(3, "2026-06-17T15:00:00Z", 3, 2),
        makeMatch(4, "2026-06-18T15:00:00Z", 1, 0),
        makeMatch(5, "2026-06-19T15:00:00Z", 2, 2),
    ];

    it("counts consecutive correct predictions from most recent", () => {
        const predictions = [
            { playerId: 1, matchId: 5, homeScore: 1, awayScore: 1 },
            { playerId: 1, matchId: 4, homeScore: 2, awayScore: 0 },
            { playerId: 1, matchId: 3, homeScore: 1, awayScore: 0 },
            { playerId: 1, matchId: 2, homeScore: 0, awayScore: 0 },
            { playerId: 1, matchId: 1, homeScore: 2, awayScore: 1 },
        ];
        const streaks = computeStreaks(matches, predictions, [1]);
        expect(streaks.get(1)).toBe(5);
    });

    it("breaks streak on wrong prediction", () => {
        const predictions = [
            { playerId: 1, matchId: 5, homeScore: 1, awayScore: 1 },
            { playerId: 1, matchId: 4, homeScore: 2, awayScore: 0 },
            { playerId: 1, matchId: 3, homeScore: 0, awayScore: 0 },
            { playerId: 1, matchId: 2, homeScore: 0, awayScore: 0 },
            { playerId: 1, matchId: 1, homeScore: 2, awayScore: 1 },
        ];
        const streaks = computeStreaks(matches, predictions, [1]);
        expect(streaks.get(1)).toBe(2);
    });

    it("breaks streak on missing prediction (no pick)", () => {
        const predictions = [
            { playerId: 1, matchId: 5, homeScore: 1, awayScore: 1 },
            { playerId: 1, matchId: 4, homeScore: 2, awayScore: 0 },
            // matchId: 3 missing
            { playerId: 1, matchId: 2, homeScore: 0, awayScore: 0 },
            { playerId: 1, matchId: 1, homeScore: 2, awayScore: 1 },
        ];
        const streaks = computeStreaks(matches, predictions, [1]);
        expect(streaks.get(1)).toBe(2);
    });

    it("returns 0 for a player with no correct predictions", () => {
        const predictions = [
            { playerId: 1, matchId: 5, homeScore: 3, awayScore: 0 },
        ];
        const streaks = computeStreaks(matches, predictions, [1]);
        expect(streaks.get(1)).toBe(0);
    });

    it("returns 0 for a player with no predictions at all", () => {
        const streaks = computeStreaks(matches, [], [1]);
        expect(streaks.get(1)).toBe(0);
    });

    it("handles multiple players independently", () => {
        const predictions = [
            { playerId: 1, matchId: 5, homeScore: 1, awayScore: 1 },
            { playerId: 1, matchId: 4, homeScore: 2, awayScore: 0 },
            { playerId: 1, matchId: 3, homeScore: 0, awayScore: 0 },
            { playerId: 2, matchId: 5, homeScore: 1, awayScore: 1 },
            { playerId: 2, matchId: 4, homeScore: 0, awayScore: 3 },
        ];
        const streaks = computeStreaks(matches, predictions, [1, 2]);
        expect(streaks.get(1)).toBe(2);
        expect(streaks.get(2)).toBe(1);
    });

    it("ignores non-FINISHED matches", () => {
        const mixedMatches = [
            ...matches,
            { id: 6, kickoff: new Date("2026-06-20T15:00:00Z"), round: "GROUP" as const, status: "SCHEDULED", homeScore: null, awayScore: null, homeTeamId: 1, awayTeamId: 2, winnerTeamId: null },
        ];
        const predictions = [
            { playerId: 1, matchId: 5, homeScore: 1, awayScore: 1 },
        ];
        const streaks = computeStreaks(mixedMatches, predictions, [1]);
        expect(streaks.get(1)).toBe(1);
    });

    it("requires 2+ points for streak (1 point does not count)", () => {
        // Match 5 is 2-2 draw. Predicting 1-0 (home win) = 0 pts.
        // But what about a case where someone gets 1 point?
        // Actually predictionPoints returns 0, 2, 3, 4, or 6. Never 1.
        // A correct result = 2 (group) or 3 (KO). So 2+ is the threshold.
        const predictions = [
            { playerId: 1, matchId: 5, homeScore: 3, awayScore: 0 },
        ];
        const streaks = computeStreaks(matches, predictions, [1]);
        expect(streaks.get(1)).toBe(0);
    });

    it("breaks streak if any simultaneous match is wrong", () => {
        const simultaneousMatches = [
            makeMatch(1, "2026-06-15T15:00:00Z", 2, 1),
            makeMatch(2, "2026-06-16T15:00:00Z", 0, 0),
            makeMatch(3, "2026-06-16T15:00:00Z", 3, 1),
        ];
        const predictions = [
            { playerId: 1, matchId: 3, homeScore: 2, awayScore: 0 },
            { playerId: 1, matchId: 2, homeScore: 1, awayScore: 1 },
            { playerId: 1, matchId: 1, homeScore: 2, awayScore: 1 },
        ];
        // match 2: pred 1-1 vs actual 0-0 = correct (draw), match 3: pred 2-0 vs actual 3-1 = correct (home win)
        // but match 2 is 1-1 vs 0-0 → correct result (both draws) = 2 pts ✓
        // match 3 is 2-0 vs 3-1 → correct result (home win) = 2 pts ✓
        // So streak should be 3 here. Let's test a real break:
        const predsWithWrong = [
            { playerId: 1, matchId: 3, homeScore: 2, awayScore: 0 },
            { playerId: 1, matchId: 2, homeScore: 2, awayScore: 0 },
            { playerId: 1, matchId: 1, homeScore: 2, awayScore: 1 },
        ];
        // match 2: pred 2-0 (home win) vs actual 0-0 (draw) = 0 pts ✗
        // match 3: pred 2-0 (home win) vs actual 3-1 (home win) = 2 pts ✓
        // These are simultaneous (same kickoff) — wrong in match 2 breaks streak
        const streaks = computeStreaks(simultaneousMatches, predsWithWrong, [1]);
        // Streak should be 0: most recent group (matches 2+3) has a wrong, so streak breaks
        expect(streaks.get(1)).toBe(0);
    });
});

describe("streakFlames", () => {
    it("returns empty for streak < 3", () => {
        expect(streakFlames(0)).toBe("");
        expect(streakFlames(1)).toBe("");
        expect(streakFlames(2)).toBe("");
    });

    it("returns single flame for 3-5", () => {
        expect(streakFlames(3)).toBe("🔥");
        expect(streakFlames(4)).toBe("🔥");
        expect(streakFlames(5)).toBe("🔥");
    });

    it("returns double flame for 6-8", () => {
        expect(streakFlames(6)).toBe("🔥🔥");
        expect(streakFlames(7)).toBe("🔥🔥");
        expect(streakFlames(8)).toBe("🔥🔥");
    });

    it("returns triple flame for 9+", () => {
        expect(streakFlames(9)).toBe("🔥🔥🔥");
        expect(streakFlames(15)).toBe("🔥🔥🔥");
    });
});
