import { describe, expect, it } from "vitest";
import {
    buildChildRows,
    snapshotMatchesAsOf,
    statesDiffer,
    type SnapshotPlayerState,
} from "./snapshot";

function s(playerId: number, rank: number, points: number, bonusPoints = 0): SnapshotPlayerState {
    return { playerId, rank, points, bonusPoints };
}

describe("buildChildRows", () => {
    it("zeros all deltas when there is no prior state (anchor row)", () => {
        const rows = buildChildRows([s(1, 1, 0), s(2, 1, 0)], null);
        expect(rows).toHaveLength(2);
        expect(rows[0]?.rankDelta).toBe(0);
        expect(rows[0]?.pointsDelta).toBe(0);
        expect(rows[1]?.rankDelta).toBe(0);
        expect(rows[1]?.pointsDelta).toBe(0);
    });

    it("computes positive rankDelta when a player moved up the table", () => {
        const prior = [s(1, 3, 10), s(2, 1, 30)];
        const next = [s(1, 1, 40), s(2, 2, 30)];
        const rows = buildChildRows(next, prior);
        const p1 = rows.find((r) => r.playerId === 1)!;
        const p2 = rows.find((r) => r.playerId === 2)!;
        expect(p1.rankDelta).toBe(2); // 3 → 1
        expect(p1.pointsDelta).toBe(30);
        expect(p2.rankDelta).toBe(-1); // 1 → 2
        expect(p2.pointsDelta).toBe(0);
    });

    it("treats brand-new players (no prior entry) as zero-delta", () => {
        const prior = [s(1, 1, 0)];
        const next = [s(1, 1, 0), s(99, 1, 0)];
        const rows = buildChildRows(next, prior);
        const newcomer = rows.find((r) => r.playerId === 99)!;
        expect(newcomer.rankDelta).toBe(0);
        expect(newcomer.pointsDelta).toBe(0);
    });

    it("captures a tie forming as ▲ for the catcher and 0 for the held player", () => {
        // Before: P1 1st (30), P2 2nd (20)
        // After:  P1 still has 30, P2 catches up to 30 → both rank 1
        const prior = [s(1, 1, 30), s(2, 2, 20)];
        const next = [s(1, 1, 30), s(2, 1, 30)];
        const rows = buildChildRows(next, prior);
        expect(rows.find((r) => r.playerId === 1)?.rankDelta).toBe(0);
        expect(rows.find((r) => r.playerId === 2)?.rankDelta).toBe(1);
        expect(rows.find((r) => r.playerId === 2)?.pointsDelta).toBe(10);
    });

    it("captures a tie breaking as ▼ for the held player", () => {
        // Before: P1 and P2 both rank 1 at 30 pts
        // After:  P1 pulls ahead with 40, P2 falls to rank 2 at 30
        const prior = [s(1, 1, 30), s(2, 1, 30)];
        const next = [s(1, 1, 40), s(2, 2, 30)];
        const rows = buildChildRows(next, prior);
        expect(rows.find((r) => r.playerId === 1)?.rankDelta).toBe(0);
        expect(rows.find((r) => r.playerId === 1)?.pointsDelta).toBe(10);
        expect(rows.find((r) => r.playerId === 2)?.rankDelta).toBe(-1);
        expect(rows.find((r) => r.playerId === 2)?.pointsDelta).toBe(0);
    });

    it("records a non-zero pointsDelta even when rank doesn't change", () => {
        // Both players gain points but maintain relative order.
        const prior = [s(1, 1, 10), s(2, 2, 5)];
        const next = [s(1, 1, 20), s(2, 2, 8)];
        const rows = buildChildRows(next, prior);
        expect(rows.find((r) => r.playerId === 1)?.rankDelta).toBe(0);
        expect(rows.find((r) => r.playerId === 1)?.pointsDelta).toBe(10);
        expect(rows.find((r) => r.playerId === 2)?.rankDelta).toBe(0);
        expect(rows.find((r) => r.playerId === 2)?.pointsDelta).toBe(3);
    });
});

describe("snapshotMatchesAsOf", () => {
    const m = (kickoffIso: string, status = "FINISHED", home = 1, away = 0) => ({
        kickoff: new Date(kickoffIso),
        status,
        homeScore: home as number | null,
        awayScore: away as number | null,
    });

    it("preserves matches whose kickoff is at or before the cutoff", () => {
        const cutoff = new Date("2026-06-15T18:00:00Z");
        const result = snapshotMatchesAsOf(
            [
                m("2026-06-14T16:00:00Z", "FINISHED", 2, 1),
                m("2026-06-15T18:00:00Z", "FINISHED", 0, 0), // exactly at cutoff
            ],
            cutoff,
        );
        expect(result[0]?.status).toBe("FINISHED");
        expect(result[0]?.homeScore).toBe(2);
        expect(result[1]?.status).toBe("FINISHED");
    });

    it("masks matches whose kickoff is after the cutoff", () => {
        const cutoff = new Date("2026-06-15T18:00:00Z");
        const result = snapshotMatchesAsOf(
            [m("2026-06-16T18:00:00Z", "FINISHED", 3, 2)],
            cutoff,
        );
        expect(result[0]?.status).toBe("SCHEDULED");
        expect(result[0]?.homeScore).toBeNull();
        expect(result[0]?.awayScore).toBeNull();
    });
});

describe("statesDiffer", () => {
    it("returns false for identical states", () => {
        const a = [s(1, 1, 30), s(2, 2, 20)];
        const b = [s(1, 1, 30), s(2, 2, 20)];
        expect(statesDiffer(a, b)).toBe(false);
    });

    it("returns true when points differ", () => {
        const a = [s(1, 1, 30), s(2, 2, 20)];
        const b = [s(1, 1, 32), s(2, 2, 20)];
        expect(statesDiffer(a, b)).toBe(true);
    });

    it("returns true when ranks differ even if points are equal", () => {
        // Could happen if a player joined or left between snapshots, shifting ranks.
        const a = [s(1, 1, 30), s(2, 2, 20)];
        const b = [s(1, 2, 30), s(2, 1, 20)];
        expect(statesDiffer(a, b)).toBe(true);
    });

    it("returns true when the player roster differs", () => {
        const a = [s(1, 1, 30)];
        const b = [s(1, 1, 30), s(2, 2, 20)];
        expect(statesDiffer(a, b)).toBe(true);
    });
});
