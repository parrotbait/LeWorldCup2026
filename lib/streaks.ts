import { predictionPoints, type Round } from "./scoring";

export interface StreakMatch {
    id: number;
    kickoff: Date;
    round: Round;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    homeTeamId: number | null;
    awayTeamId: number | null;
    winnerTeamId: number | null;
}

export interface StreakPrediction {
    playerId: number;
    matchId: number;
    homeScore: number;
    awayScore: number;
}

export function computeStreaks(
    matches: StreakMatch[],
    predictions: StreakPrediction[],
    playerIds: number[],
): Map<number, number> {
    const finished = matches
        .filter((m) => m.status === "FINISHED" && m.homeScore !== null && m.awayScore !== null)
        .sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime() || b.id - a.id);

    // Group by kickoff time so simultaneous matches are evaluated together.
    const groups: StreakMatch[][] = [];
    for (const m of finished) {
        const last = groups[groups.length - 1];
        if (last !== undefined && last[0]!.kickoff.getTime() === m.kickoff.getTime()) {
            last.push(m);
        } else {
            groups.push([m]);
        }
    }

    const predByPlayerMatch = new Map<string, StreakPrediction>();
    for (const p of predictions) {
        predByPlayerMatch.set(`${p.playerId}:${p.matchId}`, p);
    }

    const streaks = new Map<number, number>();
    for (const playerId of playerIds) {
        let streak = 0;
        let broken = false;
        for (const group of groups) {
            if (broken) {
                break;
            }
            let groupCorrect = 0;
            for (const m of group) {
                const pred = predByPlayerMatch.get(`${playerId}:${m.id}`);
                if (pred === undefined) {
                    broken = true;
                    break;
                }
                const pts = predictionPoints(m, {
                    homeScore: pred.homeScore,
                    awayScore: pred.awayScore,
                });
                if (pts >= 2) {
                    groupCorrect++;
                } else {
                    broken = true;
                    break;
                }
            }
            if (broken) {
                break;
            }
            streak += groupCorrect;
        }
        streaks.set(playerId, streak);
    }
    return streaks;
}

export function streakFlames(streak: number): string {
    if (streak >= 9) {
        return "🔥🔥🔥";
    }
    if (streak >= 6) {
        return "🔥🔥";
    }
    if (streak >= 3) {
        return "🔥";
    }
    return "";
}
