/**
 * Restore teams + matches from a snapshot JSON.
 *
 *   pnpm restore                                  → reads data/wc2026-snapshot.json
 *   pnpm restore --in=data/2026-06-08.json        → custom path
 *
 * Picks/predictions/jokers/bonuses are NOT touched. The script upserts on team
 * `code` and match `externalId` so it's safe to run repeatedly. Use this when
 * football-data.org is unreachable or you need a deterministic baseline for
 * tests.
 */

import "./_load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { matches, teams } from "../db/schema";

interface SnapshotShape {
    capturedAt: string;
    teams: {
        code: string;
        name: string;
        groupLetter: string | null;
        fifaRanking: number | null;
        pot: number | null;
    }[];
    matches: {
        externalId: number | null;
        round: string;
        groupLetter: string | null;
        matchNumber: number | null;
        kickoff: string;
        homeTeamCode: string | null;
        awayTeamCode: string | null;
        homeScore: number | null;
        awayScore: number | null;
        winnerTeamCode: string | null;
        status: string;
        venue: string | null;
    }[];
}

async function main() {
    const args = Object.fromEntries(
        process.argv
            .slice(2)
            .map((a) => /^--([^=]+)=(.*)$/.exec(a))
            .filter((m): m is RegExpExecArray => m !== null)
            .map((m) => [m[1]!, m[2]!]),
    );
    const inRel = args.in ?? "data/wc2026-snapshot.json";
    const inPath = resolve(process.cwd(), inRel);

    const raw = readFileSync(inPath, "utf-8");
    const snapshot = JSON.parse(raw) as SnapshotShape;
    console.log(`Loading snapshot from ${inRel} (captured ${snapshot.capturedAt}).`);

    // 1) Upsert teams.
    for (const t of snapshot.teams) {
        await db
            .insert(teams)
            .values({
                code: t.code,
                name: t.name,
                groupLetter: t.groupLetter,
                fifaRanking: t.fifaRanking,
                pot: t.pot,
            })
            .onConflictDoUpdate({
                target: teams.code,
                set: {
                    name: t.name,
                    groupLetter: t.groupLetter,
                    fifaRanking: t.fifaRanking,
                    pot: t.pot,
                },
            });
    }

    // 2) Build a code → id lookup for the matches.
    const allTeams = await db.select().from(teams);
    const idByCode = new Map(allTeams.map((t) => [t.code, t.id]));

    // 3) Upsert matches.
    let matchCount = 0;
    for (const m of snapshot.matches) {
        if (m.externalId === null) {
            // Without an externalId we can't safely upsert; skip with a warning.
            console.warn(`⚠ skipping match without externalId (${m.round} ${m.kickoff})`);
            continue;
        }
        const homeId = m.homeTeamCode !== null ? (idByCode.get(m.homeTeamCode) ?? null) : null;
        const awayId = m.awayTeamCode !== null ? (idByCode.get(m.awayTeamCode) ?? null) : null;
        const winnerId =
            m.winnerTeamCode !== null ? (idByCode.get(m.winnerTeamCode) ?? null) : null;

        const round = m.round as "GROUP" | "R32" | "R16" | "QF" | "SF" | "THIRD" | "FINAL";
        const status = m.status as "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED";

        await db
            .insert(matches)
            .values({
                externalId: m.externalId,
                round,
                groupLetter: m.groupLetter,
                matchNumber: m.matchNumber,
                kickoff: new Date(m.kickoff),
                homeTeamId: homeId,
                awayTeamId: awayId,
                homeScore: m.homeScore,
                awayScore: m.awayScore,
                winnerTeamId: winnerId,
                status,
                venue: m.venue,
            })
            .onConflictDoUpdate({
                target: matches.externalId,
                set: {
                    round,
                    groupLetter: m.groupLetter,
                    matchNumber: m.matchNumber,
                    kickoff: new Date(m.kickoff),
                    homeTeamId: homeId,
                    awayTeamId: awayId,
                    homeScore: m.homeScore,
                    awayScore: m.awayScore,
                    winnerTeamId: winnerId,
                    status,
                    venue: m.venue,
                },
            });
        matchCount += 1;
    }

    console.log(`✓ restored ${snapshot.teams.length} teams and ${matchCount} matches`);
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
