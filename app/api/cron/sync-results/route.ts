import { eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { matches, teams, auditLog } from "@/db/schema";
import { env } from "@/lib/env";
import { fetchMatches, fetchTeams, mapStage } from "@/lib/football-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let teamCount = 0;
    let matchCount = 0;
    let errors: string[] = [];

    try {
        const fdTeams = await fetchTeams();
        for (const t of fdTeams) {
            if (t.tla === null) {
                continue;
            }
            await db
                .insert(teams)
                .values({ code: t.tla, name: t.name })
                .onConflictDoUpdate({
                    target: teams.code,
                    set: { name: t.name },
                });
            teamCount += 1;
        }
    } catch (e) {
        errors.push(`teams: ${(e as Error).message}`);
    }

    try {
        const fdMatches = await fetchMatches();
        // Track which teams belong to which group as we go — football-data carries the
        // group letter on the match, not on /teams, so we backfill from there.
        const groupByTeamId = new Map<number, string>();
        for (const m of fdMatches) {
            const homeTeam = m.homeTeam.tla
                ? (await db.select().from(teams).where(eq(teams.code, m.homeTeam.tla)).limit(1))[0]
                : undefined;
            const awayTeam = m.awayTeam.tla
                ? (await db.select().from(teams).where(eq(teams.code, m.awayTeam.tla)).limit(1))[0]
                : undefined;

            const status =
                m.status === "FINISHED"
                    ? "FINISHED"
                    : m.status === "IN_PLAY" || m.status === "PAUSED"
                      ? "LIVE"
                      : m.status === "POSTPONED"
                        ? "POSTPONED"
                        : m.status === "CANCELLED" || m.status === "SUSPENDED"
                          ? "CANCELLED"
                          : "SCHEDULED";

            const groupLetter = m.group?.replace("GROUP_", "") ?? null;
            if (groupLetter !== null) {
                if (homeTeam !== undefined) {
                    groupByTeamId.set(homeTeam.id, groupLetter);
                }
                if (awayTeam !== undefined) {
                    groupByTeamId.set(awayTeam.id, groupLetter);
                }
            }

            await db
                .insert(matches)
                .values({
                    externalId: m.id,
                    round: mapStage(m.stage),
                    groupLetter,
                    kickoff: new Date(m.utcDate),
                    homeTeamId: homeTeam?.id,
                    awayTeamId: awayTeam?.id,
                    homeScore: m.score.fullTime.home,
                    awayScore: m.score.fullTime.away,
                    status,
                    venue: m.venue ?? null,
                })
                .onConflictDoUpdate({
                    target: matches.externalId,
                    set: {
                        kickoff: new Date(m.utcDate),
                        homeTeamId: homeTeam?.id,
                        awayTeamId: awayTeam?.id,
                        // Don't clobber admin-overridden scores.
                        homeScore: sql`CASE WHEN ${matches.adminOverridden} THEN ${matches.homeScore} ELSE ${m.score.fullTime.home} END`,
                        awayScore: sql`CASE WHEN ${matches.adminOverridden} THEN ${matches.awayScore} ELSE ${m.score.fullTime.away} END`,
                        status,
                        venue: m.venue ?? null,
                    },
                });
            matchCount += 1;
        }

        // Backfill teams.group_letter from the matches we just processed.
        for (const [teamId, groupLetter] of groupByTeamId) {
            await db.update(teams).set({ groupLetter }).where(eq(teams.id, teamId));
        }
    } catch (e) {
        errors.push(`matches: ${(e as Error).message}`);
    }

    await db.insert(auditLog).values({
        actor: "cron",
        action: "sync-results",
        detail: JSON.stringify({ teamCount, matchCount, errors }),
    });

    return NextResponse.json({ teamCount, matchCount, errors });
}
