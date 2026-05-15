import "dotenv/config";
import { db } from "./client";
import { settings, teams } from "./schema";

/**
 * Bare-bones seed: tournament kickoff timestamp + a handful of placeholder teams
 * so the app boots before the live football-data sync runs.
 *
 * For real data, run: curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-results
 */
async function main() {
    await db
        .insert(settings)
        .values({ id: 1, tournamentKickoff: new Date("2026-06-11T20:00:00Z") })
        .onConflictDoNothing();

    const placeholders: { code: string; name: string }[] = [
        { code: "MEX", name: "Mexico" },
        { code: "CAN", name: "Canada" },
        { code: "USA", name: "United States" },
        { code: "ARG", name: "Argentina" },
        { code: "FRA", name: "France" },
        { code: "ENG", name: "England" },
        { code: "BRA", name: "Brazil" },
        { code: "GER", name: "Germany" },
        { code: "ESP", name: "Spain" },
        { code: "POR", name: "Portugal" },
        { code: "NED", name: "Netherlands" },
        { code: "ITA", name: "Italy" },
    ];

    for (const t of placeholders) {
        await db.insert(teams).values(t).onConflictDoNothing();
    }

    console.log("Seeded settings and placeholder teams.");
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
