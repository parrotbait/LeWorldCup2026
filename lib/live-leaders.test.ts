import { describe, expect, it } from "vitest";
import { topByMetric } from "./live-leaders-pure";

describe("topByMetric", () => {
    it("returns null on empty input", () => {
        expect(topByMetric<{ v: number }>([], (r) => r.v)).toBeNull();
    });

    it("returns null when every metric is null", () => {
        expect(
            topByMetric<{ v: number | null }>(
                [{ v: null }, { v: null }],
                (r) => r.v,
            ),
        ).toBeNull();
    });

    it("returns null when the top metric is zero (no leader yet)", () => {
        expect(
            topByMetric<{ v: number }>([{ v: 0 }, { v: 0 }, { v: 0 }], (r) => r.v),
        ).toBeNull();
    });

    it("picks the single highest", () => {
        const r = topByMetric<{ name: string; goals: number }>(
            [
                { name: "A", goals: 3 },
                { name: "B", goals: 5 },
                { name: "C", goals: 2 },
            ],
            (x) => x.goals,
        );
        expect(r?.value).toBe(5);
        expect(r?.tied).toEqual([{ name: "B", goals: 5 }]);
    });

    it("returns every row when several share the top metric", () => {
        const r = topByMetric<{ name: string; goals: number }>(
            [
                { name: "A", goals: 4 },
                { name: "B", goals: 4 },
                { name: "C", goals: 4 },
                { name: "D", goals: 3 },
            ],
            (x) => x.goals,
        );
        expect(r?.value).toBe(4);
        expect(r?.tied).toHaveLength(3);
    });

    it("ignores null/undefined metric rows when finding the top", () => {
        const r = topByMetric<{ name: string; assists: number | null }>(
            [
                { name: "A", assists: null },
                { name: "B", assists: 2 },
                { name: "C", assists: null },
                { name: "D", assists: 1 },
            ],
            (x) => x.assists,
        );
        expect(r?.value).toBe(2);
        expect(r?.tied).toEqual([{ name: "B", assists: 2 }]);
    });
});
