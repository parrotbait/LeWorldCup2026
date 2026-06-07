/**
 * Daily nudge for unfiled picks.
 *
 * Finds matches kicking off in the next 24h (status=SCHEDULED) and emails
 * every player who hasn't filed a prediction for at least one of them.
 * One digest per player, listing the matches they're missing.
 *
 * Wired into the cron route — see app/api/cron/sync-results/route.ts.
 * Re-running within the same window will re-send: dedupe lives in the cron
 * schedule (we run twice a day at most).
 */

import { and, asc, eq, gte, inArray, lte, isNotNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { matches, players, predictions, teams } from "@/db/schema";
import { env, passwordResetEnabled } from "@/lib/env";
import { sendEmail } from "@/lib/email";

interface UpcomingMatch {
    id: number;
    kickoff: Date;
    homeName: string | null;
    awayName: string | null;
}

export interface ReminderResult {
    emailed: number;
    skipped: number;
    errors: string[];
}

const WINDOW_MS = 24 * 60 * 60_000;

export async function sendPickReminders(): Promise<ReminderResult> {
    if (!passwordResetEnabled) {
        // No Resend key configured — emailing is opt-in via env.
        return { emailed: 0, skipped: 0, errors: ["resend-not-configured"] };
    }

    const now = Date.now();
    const horizon = new Date(now + WINDOW_MS);
    const home = alias(teams, "home");
    const away = alias(teams, "away");

    const upcoming = await db
        .select({
            id: matches.id,
            kickoff: matches.kickoff,
            homeName: home.name,
            awayName: away.name,
        })
        .from(matches)
        .leftJoin(home, eq(matches.homeTeamId, home.id))
        .leftJoin(away, eq(matches.awayTeamId, away.id))
        .where(
            and(
                eq(matches.status, "SCHEDULED"),
                gte(matches.kickoff, new Date(now)),
                lte(matches.kickoff, horizon),
                isNotNull(matches.homeTeamId),
                isNotNull(matches.awayTeamId),
            ),
        )
        .orderBy(asc(matches.kickoff));

    if (upcoming.length === 0) {
        return { emailed: 0, skipped: 0, errors: [] };
    }

    const allPlayers = await db
        .select({ id: players.id, displayName: players.displayName, email: players.email })
        .from(players)
        .where(ne(players.email, ""));

    const upcomingIds = upcoming.map((m) => m.id);
    const filed = await db
        .select({ playerId: predictions.playerId, matchId: predictions.matchId })
        .from(predictions)
        .where(inArray(predictions.matchId, upcomingIds));
    const filedKey = new Set(filed.map((p) => `${p.playerId}:${p.matchId}`));

    let emailed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const player of allPlayers) {
        const missing: UpcomingMatch[] = [];
        for (const m of upcoming) {
            if (!filedKey.has(`${player.id}:${m.id}`)) {
                missing.push(m);
            }
        }
        if (missing.length === 0) {
            skipped += 1;
            continue;
        }

        const result = await sendEmail({
            to: player.email,
            subject: `LeWorldCup — ${missing.length} unfiled pick${missing.length === 1 ? "" : "s"} in the next 24h`,
            text: renderText(player.displayName, missing),
            html: renderHtml(player.displayName, missing),
        });
        if (result.sent) {
            emailed += 1;
        } else {
            errors.push(`${player.email}: ${result.error ?? "unknown"}`);
        }
    }

    return { emailed, skipped, errors };
}

function fmtKickoff(d: Date): string {
    return d.toLocaleString("en-GB", {
        timeZone: "Europe/London",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function renderText(name: string, missing: UpcomingMatch[]): string {
    const url = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "") + "/predictions";
    const lines = missing
        .map((m) => `  • ${fmtKickoff(m.kickoff)} — ${m.homeName ?? "TBD"} vs ${m.awayName ?? "TBD"}`)
        .join("\n");
    return [
        `Hey ${name},`,
        "",
        `You haven't filed picks for these matches in the next 24 hours:`,
        "",
        lines,
        "",
        `File before kickoff (locks 15 min ahead): ${url}`,
        "",
        "— LeWorldCup 2026",
    ].join("\n");
}

function renderHtml(name: string, missing: UpcomingMatch[]): string {
    const url = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "") + "/predictions";
    const items = missing
        .map(
            (m) =>
                `<li>${fmtKickoff(m.kickoff)} — <strong>${escape(m.homeName ?? "TBD")}</strong> vs <strong>${escape(m.awayName ?? "TBD")}</strong></li>`,
        )
        .join("");
    return [
        `<p>Hey ${escape(name)},</p>`,
        `<p>You haven't filed picks for the next ${missing.length} match${missing.length === 1 ? "" : "es"}:</p>`,
        `<ul>${items}</ul>`,
        `<p><a href="${url}">File your picks</a> — predictions lock 15 minutes before kickoff.</p>`,
        `<p style="opacity:0.6">— LeWorldCup 2026</p>`,
    ].join("");
}

function escape(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
