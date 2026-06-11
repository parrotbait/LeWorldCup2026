import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { matches } from "@/db/schema";

/**
 * Single source of truth for "has the tournament started" — the moment the
 * first match has actually kicked off (or cron has flipped it off
 * SCHEDULED). Used to gate concerns that should pivot exactly at kickoff.
 *
 * Used by:
 *  - app/actions/auth.ts (block self-signup; late joiners go through admin)
 *
 * NOT used for bonus-pick gating — bonuses have their own deadline with a
 * grace window past kickoff. See {@link import("./bonus-lock").getBonusLockState}.
 *
 * Anchors on the actual fixture data rather than settings.tournament_kickoff
 * so it can't drift if admin forgets to update the settings row.
 */
export interface TournamentLockState {
    locked: boolean;
    /** Earliest scheduled kickoff in the tournament. Null only when no matches exist. */
    firstKickoff: Date | null;
}

export async function getTournamentLockState(): Promise<TournamentLockState> {
    const earliest = (
        await db
            .select({ kickoff: matches.kickoff, status: matches.status })
            .from(matches)
            .orderBy(asc(matches.kickoff))
            .limit(1)
    )[0];
    if (earliest === undefined) {
        return { locked: false, firstKickoff: null };
    }
    // Lock the moment the first match has started by either signal:
    //   - the earliest kickoff has passed, OR
    //   - the earliest match has moved off SCHEDULED (cron flipped to LIVE/FINISHED).
    const locked =
        earliest.kickoff.getTime() <= Date.now() || earliest.status !== "SCHEDULED";

    // Dev-only override so we can test pre/post-lock UI without waiting on
    // real fixtures. Ignored in production to keep the bonus deadline
    // un-foolable. Set TOURNAMENT_LOCK_OVERRIDE=locked or =unlocked.
    if (process.env.NODE_ENV !== "production") {
        const override = process.env.TOURNAMENT_LOCK_OVERRIDE;
        if (override === "locked") {
            return { locked: true, firstKickoff: earliest.kickoff };
        }
        if (override === "unlocked") {
            return { locked: false, firstKickoff: earliest.kickoff };
        }
    }

    return { locked, firstKickoff: earliest.kickoff };
}
