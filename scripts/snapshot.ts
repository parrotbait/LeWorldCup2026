/**
 * Snapshot the current teams + matches into a versioned JSON file.
 *
 * Run after a successful cron sync to lock in the canonical fixture data so
 * we can restore it without depending on football-data.org being up:
 *
 *   pnpm snapshot                                 → writes data/wc2026-snapshot.json
 *   pnpm snapshot --out=data/2026-06-08.json      → custom path
 *
 * Restore later with `pnpm restore [--in=path]`.
 */

import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { db } from "../db/client";
import { matches, teams } from "../db/schema";

interface SnapshotShape {
    capturedAt: string;
    sourceNote: string;
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
    const outRel = args.out ?? "data/wc2026-snapshot.json";
    const out = resolve(process.cwd(), outRel);

    const allTeams = await db.select().from(teams);
    const allMatches = await db.select().from(matches);
    const codeById = new Map(allTeams.map((t) => [t.id, t.code]));

    const snapshot: SnapshotShape = {
        capturedAt: new Date().toISOString(),
        sourceNote:
            "Pulled from local Postgres after a successful cron sync against football-data.org /v4/competitions/WC. Restore via `pnpm restore`.",
        teams: allTeams.map((t) => ({
            code: t.code,
            name: t.name,
            groupLetter: t.groupLetter,
            fifaRanking: t.fifaRanking,
            pot: t.pot,
        })),
        matches: allMatches
            .map((m) => ({
                externalId: m.externalId,
                round: m.round,
                groupLetter: m.groupLetter,
                matchNumber: m.matchNumber,
                kickoff: m.kickoff.toISOString(),
                homeTeamCode: m.homeTeamId !== null ? (codeById.get(m.homeTeamId) ?? null) : null,
                awayTeamCode: m.awayTeamId !== null ? (codeById.get(m.awayTeamId) ?? null) : null,
                homeScore: m.homeScore,
                awayScore: m.awayScore,
                winnerTeamCode:
                    m.winnerTeamId !== null ? (codeById.get(m.winnerTeamId) ?? null) : null,
                status: m.status,
                venue: m.venue,
            }))
            .sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
    };

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n");
    console.log(
        `✓ snapshot: ${snapshot.teams.length} teams, ${snapshot.matches.length} matches → ${outRel}`,
    );
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
