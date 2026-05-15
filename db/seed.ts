import "dotenv/config";
import { db } from "./client";
import { settings } from "./schema";

/**
 * Bare-bones seed: tournament kickoff timestamp only.
 *
 * Teams + fixtures are pulled live from football-data.org by the cron route:
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-results
 *
 * That endpoint also backfills teams.group_letter from match data, so a single
 * sync gives you all 48 teams across 12 groups + the full 104-match schedule.
 */
async function main() {
    await db
        .insert(settings)
        .values({ id: 1, tournamentKickoff: new Date("2026-06-11T20:00:00Z") })
        .onConflictDoNothing();

    console.log("Seeded settings. Run the cron sync to populate teams + fixtures.");
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
