/**
 * Mark the 12 official Pot 1 teams in the DB.
 *
 *   pnpm tsx scripts/set-pots.ts
 *
 * Pot 1 is used to filter the Dark Horse picker (non-Pot-1 teams only) and
 * the "How the Mighty Have Fallen" picker (Pot-1 teams only). Source: official
 * FIFA World Cup 2026 final draw, Kennedy Center, December 2025 — three hosts
 * plus the nine top-ranked qualifiers.
 *
 * Re-runnable: clears any existing pot=1 markings then re-applies, so it's
 * safe to run after a snapshot restore. Doesn't touch Pot 2/3/4 (we don't
 * surface those in any UI).
 */

import "./_load-env";
import { eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { teams } from "../db/schema";

const POT_1_TLAS = [
    // Hosts
    "USA",
    "MEX",
    "CAN",
    // Top-ranked qualifiers (FIFA ranking at draw time)
    "ESP",
    "ARG",
    "FRA",
    "ENG",
    "BRA",
    "POR",
    "NED",
    "BEL",
    "GER",
] as const;

async function main(): Promise<void> {
    // Clear any existing pot=1 first so the canonical list is the source of truth.
    await db
        .update(teams)
        .set({ pot: null })
        .where(eq(teams.pot, 1));

    const updated = await db
        .update(teams)
        .set({ pot: 1 })
        .where(inArray(teams.code, POT_1_TLAS as unknown as string[]))
        .returning({ code: teams.code, name: teams.name });

    console.log(`✓ marked ${updated.length} teams as Pot 1:`);
    for (const t of updated.sort((a, b) => a.name.localeCompare(b.name))) {
        console.log(`   ${t.code}  ${t.name}`);
    }

    const missing = POT_1_TLAS.filter((c) => !updated.some((t) => t.code === c));
    if (missing.length > 0) {
        console.warn(
            `\n⚠ ${missing.length} TLA(s) didn't match a team in the DB: ${missing.join(", ")}.`,
        );
        console.warn(
            "   Either the team list isn't loaded yet (run pnpm restore), or football-data sends a different TLA for that country (check teams.code).",
        );
    }
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
