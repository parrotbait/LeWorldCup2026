import { predictionPoints, type Round } from "./scoring";

export interface RivalryMatch {
    id: number;
    round: Round;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    homeTeamId: number | null;
    awayTeamId: number | null;
    winnerTeamId: number | null;
}

export interface RivalryPrediction {
    playerId: number;
    matchId: number;
    homeScore: number;
    awayScore: number;
}

export interface RivalryJoker {
    playerId: number;
    matchId: number;
}

export function computePointsForMatches(
    matches: RivalryMatch[],
    predictions: RivalryPrediction[],
    jokers: RivalryJoker[],
    playerIds: number[],
): Map<number, number> {
    const finished = matches.filter(
        (m) => m.status === "FINISHED" && m.homeScore !== null && m.awayScore !== null,
    );

    const predByPlayerMatch = new Map<string, RivalryPrediction>();
    for (const p of predictions) {
        predByPlayerMatch.set(`${p.playerId}:${p.matchId}`, p);
    }

    const jokerSet = new Set(jokers.map((j) => `${j.playerId}:${j.matchId}`));

    const result = new Map<number, number>();
    for (const playerId of playerIds) {
        let total = 0;
        for (const m of finished) {
            const pred = predByPlayerMatch.get(`${playerId}:${m.id}`);
            if (pred === undefined) {
                continue;
            }
            const base = predictionPoints(m, {
                homeScore: pred.homeScore,
                awayScore: pred.awayScore,
            });
            const isJoker = jokerSet.has(`${playerId}:${m.id}`);
            total += base * (isJoker ? 2 : 1);
        }
        result.set(playerId, total);
    }
    return result;
}
