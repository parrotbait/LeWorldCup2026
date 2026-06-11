import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { matches } from "@/db/schema";

/**
 * Bonus-pick deadline. Distinct from {@link getTournamentLockState} on
 * purpose: that one fires the moment the first match actually kicks off (or
 * cron flips its status off SCHEDULED) and continues to gate signup, joker,
 * and match-prediction concerns. This one only governs bonus picks and
 * their reveal — extended past kickoff so late-fillers who missed the
 * /bonuses page get a grace window, with the trade-off that they may pick
 * after seeing some opening-match results.
 *
 * Used by:
 *  - app/bonuses/page.tsx (picker edit gate + all-picks reveal)
 *  - app/actions/picks.ts saveBonusAction / clearBonusAction (server enforcement)
 *  - app/players/[id]/page.tsx (reveal others' bonus picks)
 *  - app/stats/page.tsx (reveal "Picked by" lines)
 *
 * Reveals MUST gate on the same boundary as edits — otherwise late-fillers
 * could copy others' picks during the grace window.
 */

const BONUS_DEADLINE_GRACE_MS = 24 * 60 * 60 * 1000;

export interface BonusLockState {
    locked: boolean;
    /** Moment bonuses lock — earliest kickoff + 24h. Null when no fixtures. */
    deadline: Date | null;
}

export async function getBonusLockState(): Promise<BonusLockState> {
    const earliest = (
        await db
            .select({ kickoff: matches.kickoff })
            .from(matches)
            .orderBy(asc(matches.kickoff))
            .limit(1)
    )[0];
    if (earliest === undefined) {
        return { locked: false, deadline: null };
    }
    const deadline = new Date(earliest.kickoff.getTime() + BONUS_DEADLINE_GRACE_MS);
    let locked = Date.now() >= deadline.getTime();

    // Dev-only override so we can test pre/post-lock UI without waiting on
    // the deadline. Ignored in production. Set BONUS_LOCK_OVERRIDE=locked or
    // =unlocked.
    if (process.env.NODE_ENV !== "production") {
        const override = process.env.BONUS_LOCK_OVERRIDE;
        if (override === "locked") {
            locked = true;
        } else if (override === "unlocked") {
            locked = false;
        }
    }

    return { locked, deadline };
}
