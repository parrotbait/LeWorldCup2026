import { db } from "@/db/client";
import { matches, players, predictions, jokers } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { buildLeaderboard } from "@/lib/scoring";
import { NavBar } from "@/app/_components/navbar";

export const revalidate = 30;

export default async function LeaderboardPage() {
    const session = await requireSession();

    const [allPlayers, allMatches, allPredictions, allJokers] = await Promise.all([
        db.select().from(players),
        db.select().from(matches),
        db.select().from(predictions),
        db.select().from(jokers),
    ]);

    const rows = buildLeaderboard({
        players: allPlayers.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            joinedAt: p.joinedAt,
        })),
        matches: allMatches.map((m) => ({
            id: m.id,
            round: m.round,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
        })),
        predictions: allPredictions.map((p) => ({
            playerId: p.playerId,
            matchId: p.matchId,
            homeScore: p.homeScore,
            awayScore: p.awayScore,
        })),
        jokers: allJokers.map((j) => ({
            playerId: j.playerId,
            round: j.round,
            matchId: j.matchId,
        })),
        // TODO: bonus aggregation comes from db.bonus_picks + resolved settings.
        bonusPointsByPlayer: new Map(),
    });

    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-3xl px-6 py-8">
                <h1 className="font-display text-2xl uppercase tracking-widest">Standings</h1>
                <p className="mt-1 text-xs opacity-60">
                    Tie-breakers: total → exact predictions → bonuses → KO results → signup
                </p>

                <table className="mt-6 w-full text-sm tabular">
                    <thead className="border-b border-ink/30 text-left font-display text-xs uppercase tracking-wider">
                        <tr>
                            <th className="py-2 pr-2">#</th>
                            <th className="py-2 pr-2">Player</th>
                            <th className="py-2 pr-2 text-right">Pts</th>
                            <th className="py-2 pr-2 text-right">Exact</th>
                            <th className="py-2 pr-2 text-right">Bonus</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="py-8 text-center opacity-60">
                                    No players yet. Share the invite code.
                                </td>
                            </tr>
                        ) : (
                            rows.map((r, i) => {
                                const me = r.playerId === session.playerId;
                                return (
                                    <tr
                                        key={r.playerId}
                                        className={`border-b border-ink/10 ${me ? "bg-mustard/15" : ""}`}
                                    >
                                        <td className="py-2 pr-2">{i + 1}</td>
                                        <td className="py-2 pr-2">
                                            {i === 0 ? "👑 " : ""}
                                            {r.displayName}
                                            {me ? <span className="ml-2 text-xs opacity-50">(you)</span> : null}
                                        </td>
                                        <td className="py-2 pr-2 text-right font-display">{r.points}</td>
                                        <td className="py-2 pr-2 text-right opacity-70">{r.exactCount}</td>
                                        <td className="py-2 pr-2 text-right opacity-70">{r.bonusPoints}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </main>
        </>
    );
}
