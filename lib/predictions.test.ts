import { describe, expect, it } from "vitest";
import { getOpenPredictionDeadline, type MatchForDeadline } from "./predictions";

function match(overrides: Partial<MatchForDeadline> & { id: number }): MatchForDeadline {
    return {
        kickoff: new Date("2026-06-28T15:00:00Z"),
        status: "SCHEDULED",
        homeName: "England",
        awayName: "France",
        ...overrides,
    };
}

describe("getOpenPredictionDeadline", () => {
    const HOUR = 60 * 60_000;
    const baseNow = new Date("2026-06-28T12:00:00Z").getTime();

    it("returns null when all matches are predicted", () => {
        const matches = [match({ id: 1 }), match({ id: 2 })];
        const predicted = new Set([1, 2]);
        expect(getOpenPredictionDeadline(matches, predicted, baseNow)).toBeNull();
    });

    it("returns null when no matches exist", () => {
        expect(getOpenPredictionDeadline([], new Set(), baseNow)).toBeNull();
    });

    it("excludes TBD matches (homeName null)", () => {
        const matches = [match({ id: 1, homeName: null })];
        expect(getOpenPredictionDeadline(matches, new Set(), baseNow)).toBeNull();
    });

    it("excludes TBD matches (awayName null)", () => {
        const matches = [match({ id: 1, awayName: null })];
        expect(getOpenPredictionDeadline(matches, new Set(), baseNow)).toBeNull();
    });

    it("excludes FINISHED matches", () => {
        const matches = [match({ id: 1, status: "FINISHED" })];
        expect(getOpenPredictionDeadline(matches, new Set(), baseNow)).toBeNull();
    });

    it("excludes LIVE matches", () => {
        const matches = [match({ id: 1, status: "LIVE" })];
        expect(getOpenPredictionDeadline(matches, new Set(), baseNow)).toBeNull();
    });

    it("excludes matches whose lock time has passed", () => {
        const pastKickoff = new Date("2026-06-28T11:00:00Z");
        const matches = [match({ id: 1, kickoff: pastKickoff })];
        expect(getOpenPredictionDeadline(matches, new Set(), baseNow)).toBeNull();
    });

    it("returns open count and next lock time for unpredicted scheduled matches", () => {
        const kickoff1 = new Date("2026-06-28T16:00:00Z");
        const kickoff2 = new Date("2026-06-28T19:00:00Z");
        const matches = [
            match({ id: 1, kickoff: kickoff1 }),
            match({ id: 2, kickoff: kickoff2 }),
            match({ id: 3, kickoff: kickoff2 }),
        ];
        const predicted = new Set([2]);
        const result = getOpenPredictionDeadline(matches, predicted, baseNow);
        expect(result).not.toBeNull();
        expect(result!.openCount).toBe(2);
        expect(result!.nextLockMs).toBeGreaterThan(0);
    });

    it("only counts matches the user hasn't predicted", () => {
        const kickoff = new Date("2026-06-28T16:00:00Z");
        const matches = [
            match({ id: 1, kickoff }),
            match({ id: 2, kickoff }),
            match({ id: 3, kickoff }),
        ];
        const predicted = new Set([1, 3]);
        const result = getOpenPredictionDeadline(matches, predicted, baseNow);
        expect(result!.openCount).toBe(1);
    });

    it("uses the first match in the array for nextLockMs", () => {
        const early = new Date("2026-06-28T14:00:00Z");
        const late = new Date("2026-06-28T20:00:00Z");
        const matches = [
            match({ id: 1, kickoff: early }),
            match({ id: 2, kickoff: late }),
        ];
        const result = getOpenPredictionDeadline(matches, new Set(), baseNow);
        expect(result!.nextLockMs).toBeLessThan(3 * HOUR);
    });

    it("returns null when next unpredicted lock is more than 24h away", () => {
        const farKickoff = new Date("2026-06-30T15:00:00Z");
        const matches = [match({ id: 1, kickoff: farKickoff })];
        expect(getOpenPredictionDeadline(matches, new Set(), baseNow)).toBeNull();
    });
});
