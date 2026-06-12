import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, bonusPicks, bonusResolutions, matches, players, predictions, jokers } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { buildLeaderboard, computeBonusPointsByPlayer } from "@/lib/scoring";
import { NavBar } from "@/app/_components/navbar";

export const revalidate = 30;

function relativeAgo(d: Date): string {
    const ms = Date.now() - d.getTime();
    if (ms < 60_000) {
        return "just now";
    }
    const mins = Math.floor(ms / 60_000);
    if (mins < 60) {
        return `${mins} min ago`;
    }
    const hours = Math.floor(mins / 60);
    if (hours < 48) {
        return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export default async function LeaderboardPage() {
    const session = await requireSession();

    const [allPlayers, allMatches, allPredictions, allJokers, allBonusPicks, allResolutions, lastSync] =
        await Promise.all([
            db.select().from(players),
            db.select().from(matches),
            db.select().from(predictions),
            db.select().from(jokers),
            db.select().from(bonusPicks),
            db.select().from(bonusResolutions),
            db
                .select({ at: auditLog.at })
                .from(auditLog)
                .where(eq(auditLog.action, "sync-results"))
                .orderBy(desc(auditLog.id))
                .limit(1),
        ]);

    const bonusPointsByPlayer = computeBonusPointsByPlayer({
        picks: allBonusPicks.map((b) => ({
            playerId: b.playerId,
            kind: b.kind,
            groupLetter: b.groupLetter,
            teamId: b.teamId,
            playerName: b.playerName,
        })),
        resolutions: allResolutions.map((r) => ({
            kind: r.kind,
            groupLetter: r.groupLetter,
            teamIds: r.teamIds,
            playerNames: r.playerNames,
        })),
        matches: allMatches.map((m) => ({
            round: m.round,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
        })),
    });

    const rows = buildLeaderboard({
        players: allPlayers.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            joinedAt: p.joinedAt,
        })),
        matches: allMatches.map((m) => ({
            id: m.id,
            round: m.round,
            status: m.status,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            winnerTeamId: m.winnerTeamId,
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
        bonusPointsByPlayer,
    });

    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-3xl px-6 py-8">
                <h1 className="font-display text-2xl uppercase tracking-widest">Standings</h1>
                <p className="mt-1 text-xs opacity-60">
                    Tie-breakers: total → exact predictions → bonuses → KO results → signup
                </p>
                {(() => {
                    const lastAt = lastSync[0]?.at;
                    if (lastAt === undefined) {
                        return (
                            <p className="mt-1 text-[11px] uppercase tracking-wider opacity-50">
                                no sync yet
                            </p>
                        );
                    }
                    const ageMs = Date.now() - lastAt.getTime();
                    const stale = ageMs > 12 * 60 * 60_000;
                    const stamp = lastAt.toISOString().replace("T", " ").slice(0, 16) + "Z";
                    if (stale) {
                        return (
                            <p className="mt-1 inline-flex items-center gap-2 rounded border border-tournament/40 bg-tournament/10 px-2 py-1 font-display text-[11px] uppercase tracking-wider text-tournament">
                                ⚠ stale — last synced {relativeAgo(lastAt)} ({stamp})
                                <Link
                                    href="/admin/dashboard"
                                    className="underline underline-offset-2 hover:text-ink"
                                >
                                    sync now
                                </Link>
                            </p>
                        );
                    }
                    return (
                        <p className="mt-1 text-[11px] uppercase tracking-wider opacity-50">
                            last synced {relativeAgo(lastAt)} · {stamp}
                        </p>
                    );
                })()}

                <table className="mt-6 w-full text-sm tabular">
                    <thead className="border-b border-ink/30 text-left font-display text-xs uppercase tracking-wider">
                        <tr>
                            <th className="py-2 pr-2">#</th>
                            <th className="py-2 pr-2">Player</th>
                            <th className="py-2 pr-2 text-right">Pred</th>
                            <th className="py-2 pr-2 text-right">Bonus</th>
                            <th className="py-2 pr-2 text-right">Exact</th>
                            <th className="py-2 pr-2 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-8 text-center opacity-60">
                                    No players yet. Share the invite code.
                                </td>
                            </tr>
                        ) : (
                            rows.map((r, i) => {
                                const me = r.playerId === session.playerId;
                                const predPoints = r.points - r.bonusPoints;
                                return (
                                    <tr
                                        key={r.playerId}
                                        className={`border-b border-ink/10 ${me ? "bg-mustard/15" : ""}`}
                                    >
                                        <td className="py-2 pr-2">{i + 1}</td>
                                        <td className="py-2 pr-2">
                                            <Link
                                                href={`/players/${r.playerId}` as never}
                                                className="hover:text-tournament hover:underline"
                                            >
                                                {i === 0 ? "👑 " : ""}
                                                {r.displayName}
                                                {me ? (
                                                    <span className="ml-2 text-xs opacity-50">(you)</span>
                                                ) : null}
                                            </Link>
                                        </td>
                                        <td className="py-2 pr-2 text-right opacity-70">{predPoints}</td>
                                        <td className="py-2 pr-2 text-right opacity-70">{r.bonusPoints}</td>
                                        <td className="py-2 pr-2 text-right opacity-70">{r.exactCount}</td>
                                        <td className="py-2 pr-2 text-right font-display text-base font-bold">
                                            {r.points}
                                        </td>
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
