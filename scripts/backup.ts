/**
 * Full database backup — every table players actually file picks against.
 *
 * Writes a versioned JSON file with players (sans password_hash), predictions,
 * bonus picks, jokers, bonus resolutions, teams, matches, settings and
 * audit_log. This is the "rewind to a moment in time" file you'd use after
 * a fat-finger drop, a bad migration, or a Neon incident.
 *
 *   pnpm db:backup                                          → backups/leworldcup-YYYY-MM-DD-hhmm.json
 *   pnpm db:backup --out=backups/before-migration-08.json   → custom path
 *
 * Restore is intentionally NOT a single command — see docs/TESTING.md §13
 * and the restore drill in docs/tech-stack.md. We don't want a one-keystroke
 * "wipe production and replay this file" command sitting in the repo.
 */

import "./_load-env";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { db } from "../db/client";
import {
    auditLog,
    bonusPicks,
    bonusResolutions,
    jokers,
    matches,
    players,
    predictions,
    settings,
    teams,
} from "../db/schema";

async function main() {
    const args = Object.fromEntries(
        process.argv
            .slice(2)
            .map((a) => /^--([^=]+)=(.*)$/.exec(a))
            .filter((m): m is RegExpExecArray => m !== null)
            .map((m) => [m[1]!, m[2]!]),
    );

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
    const outRel = args.out ?? `backups/leworldcup-${stamp}.json`;
    const out = resolve(process.cwd(), outRel);

    const [
        allPlayers,
        allTeams,
        allMatches,
        allPredictions,
        allBonusPicks,
        allJokers,
        allBonusResolutions,
        allSettings,
        allAudit,
    ] = await Promise.all([
        db.select().from(players),
        db.select().from(teams),
        db.select().from(matches),
        db.select().from(predictions),
        db.select().from(bonusPicks),
        db.select().from(jokers),
        db.select().from(bonusResolutions),
        db.select().from(settings),
        db.select().from(auditLog),
    ]);

    const backup = {
        capturedAt: new Date().toISOString(),
        schemaVersion: 1,
        sourceNote:
            "Full backup of leworldcup tables. Players' password_hash and reset_token_hash fields are omitted — restore them from a separate secret store or force a password reset on the recovered DB.",
        // Players are listed by id so predictions/jokers/bonusPicks can FK back.
        // password_hash + reset_token_hash deliberately omitted.
        players: allPlayers.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            email: p.email,
            joinedAt: p.joinedAt.toISOString(),
        })),
        teams: allTeams.map((t) => ({
            id: t.id,
            code: t.code,
            name: t.name,
            groupLetter: t.groupLetter,
            fifaRanking: t.fifaRanking,
            pot: t.pot,
        })),
        matches: allMatches.map((m) => ({
            id: m.id,
            externalId: m.externalId,
            round: m.round,
            groupLetter: m.groupLetter,
            matchNumber: m.matchNumber,
            kickoff: m.kickoff.toISOString(),
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            homeScoreFt: m.homeScoreFt,
            awayScoreFt: m.awayScoreFt,
            homeScorePens: m.homeScorePens,
            awayScorePens: m.awayScorePens,
            winnerTeamId: m.winnerTeamId,
            status: m.status,
            adminOverridden: m.adminOverridden,
            venue: m.venue,
        })),
        predictions: allPredictions.map((p) => ({
            playerId: p.playerId,
            matchId: p.matchId,
            homeScore: p.homeScore,
            awayScore: p.awayScore,
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
        })),
        bonusPicks: allBonusPicks.map((b) => ({
            playerId: b.playerId,
            kind: b.kind,
            groupLetter: b.groupLetter,
            teamId: b.teamId,
            playerName: b.playerName,
            createdAt: b.createdAt.toISOString(),
            updatedAt: b.updatedAt.toISOString(),
        })),
        jokers: allJokers.map((j) => ({
            playerId: j.playerId,
            round: j.round,
            matchId: j.matchId,
            createdAt: j.createdAt.toISOString(),
        })),
        bonusResolutions: allBonusResolutions.map((r) => ({
            kind: r.kind,
            groupLetter: r.groupLetter,
            teamIds: r.teamIds,
            playerNames: r.playerNames,
            updatedAt: r.updatedAt.toISOString(),
        })),
        settings: allSettings.map((s) => ({
            id: s.id,
            tournamentKickoff: s.tournamentKickoff?.toISOString() ?? null,
        })),
        auditLog: allAudit.map((a) => ({
            id: a.id,
            at: a.at.toISOString(),
            actor: a.actor,
            action: a.action,
            detail: a.detail,
        })),
    };

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(backup, null, 2) + "\n");
    console.log(
        `✓ backup: ${backup.players.length} players, ${backup.predictions.length} predictions, ` +
            `${backup.bonusPicks.length} bonus picks, ${backup.jokers.length} jokers, ` +
            `${backup.matches.length} matches, ${backup.auditLog.length} audit rows → ${outRel}`,
    );
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
