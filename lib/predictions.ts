import { pickLockTime } from "./utils";

export interface MatchForDeadline {
    id: number;
    kickoff: Date;
    status: string;
    homeName: string | null;
    awayName: string | null;
}

export interface DeadlineInfo {
    openCount: number;
    nextLockMs: number;
}

export function getOpenPredictionDeadline(
    matches: MatchForDeadline[],
    predictedMatchIds: Set<number>,
    now: number,
): DeadlineInfo | null {
    const open = matches.filter(
        (m) =>
            !predictedMatchIds.has(m.id) &&
            m.homeName !== null &&
            m.awayName !== null &&
            pickLockTime(m.kickoff) > now &&
            m.status === "SCHEDULED",
    );
    if (open.length === 0) {
        return null;
    }
    return {
        openCount: open.length,
        nextLockMs: pickLockTime(open[0]!.kickoff) - now,
    };
}
