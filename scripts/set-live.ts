import "./_load-env";
import { db } from "../db/client";
import { matches, teams } from "../db/schema";
import { eq, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

async function main() {
    const home = alias(teams, "home");
    const away = alias(teams, "away");

    const next = await db
        .select({
            id: matches.id,
            status: matches.status,
            kickoff: matches.kickoff,
            homeName: home.name,
            awayName: away.name,
        })
        .from(matches)
        .leftJoin(home, eq(matches.homeTeamId, home.id))
        .leftJoin(away, eq(matches.awayTeamId, away.id))
        .where(eq(matches.status, "SCHEDULED"))
        .orderBy(asc(matches.kickoff))
        .limit(3);

    for (const m of next) {
        console.log(m.id, m.homeName, "vs", m.awayName, m.kickoff.toISOString());
    }

    if (next[0] !== undefined) {
        const matchId = next[0].id;
        await db
            .update(matches)
            .set({ status: "LIVE", homeScore: 1, awayScore: 0 })
            .where(eq(matches.id, matchId));
        console.log(`\n✓ Set match #${matchId} (${next[0].homeName} vs ${next[0].awayName}) to LIVE 1-0`);
    }

    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
