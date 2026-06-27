import { describe, expect, it } from "vitest";
import {
    buildMatchDiffs,
    buildPlayerImpacts,
    buildSyncAuditTrail,
    SyncRegressionError,
    type MatchState,
} from "./sync-integrity";
import type { SnapshotPlayerState } from "./snapshot";

function makeMatch(overrides: Partial<MatchState> & { id: number }): MatchState {
    return {
        externalId: overrides.id * 100,
        status: "SCHEDULED",
        homeScore: null,
        awayScore: null,
        homeName: "Home",
        awayName: "Away",
        ...overrides,
    };
}

function s(playerId: number, points: number, bonusPoints = 0): SnapshotPlayerState {
    return { playerId, rank: 1, points, bonusPoints };
}

describe("buildMatchDiffs", () => {
    it("detects status transitions", () => {
        const before = [makeMatch({ id: 1, status: "SCHEDULED" })];
        const after = [makeMatch({ id: 1, status: "FINISHED", homeScore: 2, awayScore: 1 })];
        const diffs = buildMatchDiffs(before, after);
        expect(diffs).toHaveLength(1);
        expect(diffs[0]!.oldStatus).toBe("SCHEDULED");
        expect(diffs[0]!.newStatus).toBe("FINISHED");
        expect(diffs[0]!.oldScore).toBeNull();
        expect(diffs[0]!.newScore).toBe("2-1");
    });

    it("detects score corrections on already-finished matches", () => {
        const before = [makeMatch({ id: 1, status: "FINISHED", homeScore: 1, awayScore: 0 })];
        const after = [makeMatch({ id: 1, status: "FINISHED", homeScore: 2, awayScore: 0 })];
        const diffs = buildMatchDiffs(before, after);
        expect(diffs).toHaveLength(1);
        expect(diffs[0]!.oldScore).toBe("1-0");
        expect(diffs[0]!.newScore).toBe("2-0");
    });

    it("returns empty when nothing changed", () => {
        const matches = [makeMatch({ id: 1, status: "FINISHED", homeScore: 2, awayScore: 1 })];
        const diffs = buildMatchDiffs(matches, matches);
        expect(diffs).toHaveLength(0);
    });

    it("handles new matches that didn't exist before", () => {
        const before: MatchState[] = [];
        const after = [makeMatch({ id: 1, status: "SCHEDULED" })];
        const diffs = buildMatchDiffs(before, after);
        expect(diffs).toHaveLength(1);
        expect(diffs[0]!.oldStatus).toBe("NEW");
    });

    it("includes match label from team names", () => {
        const before = [makeMatch({ id: 1, homeName: "France", awayName: "Brazil" })];
        const after = [makeMatch({ id: 1, homeName: "France", awayName: "Brazil", status: "LIVE" })];
        const diffs = buildMatchDiffs(before, after);
        expect(diffs[0]!.label).toBe("France vs Brazil");
    });
});

describe("buildPlayerImpacts", () => {
    const names = new Map([[1, "Alice"], [2, "Bob"]]);

    it("computes positive deltas for points gained", () => {
        const before = [s(1, 10), s(2, 20)];
        const after = [s(1, 14), s(2, 22)];
        const impacts = buildPlayerImpacts(before, after, names);
        expect(impacts.find((p) => p.playerId === 1)!.pointsDelta).toBe(4);
        expect(impacts.find((p) => p.playerId === 2)!.pointsDelta).toBe(2);
    });

    it("flags negative deltas as regressions", () => {
        const before = [s(1, 100), s(2, 50)];
        const after = [s(1, 94), s(2, 50)];
        const impacts = buildPlayerImpacts(before, after, names);
        const alice = impacts.find((p) => p.playerId === 1)!;
        expect(alice.pointsDelta).toBe(-6);
    });

    it("handles new players not in before state", () => {
        const before: SnapshotPlayerState[] = [];
        const after = [s(1, 10)];
        const impacts = buildPlayerImpacts(before, after, names);
        expect(impacts[0]!.oldPoints).toBe(0);
        expect(impacts[0]!.pointsDelta).toBe(10);
    });

    it("tracks bonus point changes separately", () => {
        const before = [s(1, 10, 5)];
        const after = [s(1, 15, 10)];
        const impacts = buildPlayerImpacts(before, after, names);
        expect(impacts[0]!.bonusDelta).toBe(5);
    });
});

describe("buildSyncAuditTrail", () => {
    const names = new Map([[1, "Alice"], [2, "Bob"]]);

    it("reports hasRegression=true when any player loses points", () => {
        const matchesBefore = [makeMatch({ id: 1, status: "FINISHED", homeScore: 1, awayScore: 0 })];
        const matchesAfter = [makeMatch({ id: 1, status: "FINISHED", homeScore: 0, awayScore: 0 })];
        const stateBefore = [s(1, 100), s(2, 50)];
        const stateAfter = [s(1, 94), s(2, 52)];
        const trail = buildSyncAuditTrail(matchesBefore, matchesAfter, stateBefore, stateAfter, names);
        expect(trail.hasRegression).toBe(true);
        expect(trail.regressions).toHaveLength(1);
        expect(trail.regressions[0]!.displayName).toBe("Alice");
        expect(trail.regressions[0]!.pointsDelta).toBe(-6);
    });

    it("reports hasRegression=false when all players gain or stay", () => {
        const matchesBefore = [makeMatch({ id: 1, status: "SCHEDULED" })];
        const matchesAfter = [makeMatch({ id: 1, status: "FINISHED", homeScore: 2, awayScore: 1 })];
        const stateBefore = [s(1, 10), s(2, 20)];
        const stateAfter = [s(1, 14), s(2, 22)];
        const trail = buildSyncAuditTrail(matchesBefore, matchesAfter, stateBefore, stateAfter, names);
        expect(trail.hasRegression).toBe(false);
        expect(trail.regressions).toHaveLength(0);
    });
});

describe("SyncRegressionError", () => {
    it("includes affected player names and deltas in message", () => {
        const trail = buildSyncAuditTrail(
            [],
            [],
            [s(1, 100)],
            [s(1, 94)],
            new Map([[1, "Alice"]]),
        );
        const err = new SyncRegressionError(trail);
        expect(err.message).toContain("Alice -6");
        expect(err.message).toContain("SYNC_FORCE=1");
        expect(err.audit).toBe(trail);
    });
});
