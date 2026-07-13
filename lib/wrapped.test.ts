import { describe, expect, it } from "vitest";
import { isTournamentComplete, isWrappedUnlocked } from "./wrapped";

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
