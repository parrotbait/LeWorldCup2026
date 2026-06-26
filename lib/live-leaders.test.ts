import { describe, expect, it } from "vitest";
import { sortWoodenSpoonCandidates, topByMetric } from "./live-leaders-pure";

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

describe("sortWoodenSpoonCandidates", () => {
    function team(id: number, name: string, points: number, gf: number, ga: number) {
        return { id, name, points, goalsFor: gf, goalsAgainst: ga };
    }

    it("sorts fewest points first", () => {
        const sorted = sortWoodenSpoonCandidates([
            team(1, "A", 3, 2, 2),
            team(2, "B", 0, 1, 5),
            team(3, "C", 1, 1, 3),
        ]);
        expect(sorted[0].name).toBe("B");
        expect(sorted[1].name).toBe("C");
        expect(sorted[2].name).toBe("A");
    });

    it("breaks points tie by worst goal difference", () => {
        const sorted = sortWoodenSpoonCandidates([
            team(1, "A", 0, 1, 4), // GD = -3
            team(2, "B", 0, 0, 7), // GD = -7
            team(3, "C", 0, 2, 5), // GD = -3
        ]);
        expect(sorted[0].name).toBe("B");
    });

    it("breaks GD tie by fewest goals scored", () => {
        const sorted = sortWoodenSpoonCandidates([
            team(1, "A", 0, 2, 5), // GD = -3, GF = 2
            team(2, "B", 0, 1, 4), // GD = -3, GF = 1
            team(3, "C", 0, 3, 6), // GD = -3, GF = 3
        ]);
        expect(sorted[0].name).toBe("B");
        expect(sorted[1].name).toBe("A");
        expect(sorted[2].name).toBe("C");
    });

    it("teams with same points, GD, and GF are considered tied", () => {
        const sorted = sortWoodenSpoonCandidates([
            team(1, "A", 1, 1, 4),
            team(2, "B", 1, 1, 4),
        ]);
        expect(sorted[0].points).toBe(sorted[1].points);
        expect(sorted[0].goalsFor).toBe(sorted[1].goalsFor);
        expect(sorted[0].goalsFor - sorted[0].goalsAgainst).toBe(
            sorted[1].goalsFor - sorted[1].goalsAgainst,
        );
    });

    it("does not mutate the input array", () => {
        const input = [
            team(1, "A", 3, 2, 2),
            team(2, "B", 0, 1, 5),
        ];
        const original = [...input];
        sortWoodenSpoonCandidates(input);
        expect(input).toEqual(original);
    });

    it("handles single candidate", () => {
        const sorted = sortWoodenSpoonCandidates([team(1, "A", 0, 0, 9)]);
        expect(sorted).toHaveLength(1);
        expect(sorted[0].name).toBe("A");
    });

    it("realistic scenario: 0 pts team with -7 GD beats 1 pt team with -2 GD", () => {
        const sorted = sortWoodenSpoonCandidates([
            team(1, "Uruguay", 2, 3, 2),   // 2 pts, GD +1
            team(2, "Curaçao", 0, 0, 7),   // 0 pts, GD -7
            team(3, "Panama", 1, 1, 3),     // 1 pt, GD -2
        ]);
        expect(sorted[0].name).toBe("Curaçao");
        expect(sorted[1].name).toBe("Panama");
        expect(sorted[2].name).toBe("Uruguay");
    });
});
