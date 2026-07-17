import { asc } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db/client";
import { players } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { computeAllWrappedForPreview, wrappedUnlocked } from "@/lib/wrapped-store";
import { RebuildAllWrappedButton } from "./_components/RebuildAllWrappedButton";

export const revalidate = 0;

const PERSONA_TITLE: Record<string, string> = {
    EARLY_RETIREMENT: "The Early Retirement",
    CHAMPION: "The Champion",
    WOODEN_SPOON: "The Wooden Spoon",
    STEADY_EDDIE: "Steady Eddie",
    ORACLE: "The Oracle",
    SNIPER: "The Sniper",
    CONTRARIAN: "The Contrarian",
    MAVERICK: "The Maverick",
    CHANCER: "The Chancer",
    BONUS_MERCHANT: "The Bonus Merchant",
    PROPHET: "The Prophet",
    DARK_HORSE_WHISPERER: "The Dark Horse Whisperer",
    CLOSER: "The Closer",
    FAST_STARTER: "The Fast Starter",
    COMEBACK: "The Comeback",
    FRONTRUNNER: "The Frontrunner",
    OPTIMIST: "The Optimist",
    CAGEY_ONE: "The Cagey One",
    METRONOME: "The Metronome",
    NEARLY_MAN: "The Nearly Man",
};

export default async function AdminWrappedPage() {
    await requireAdmin();

    const [allPlayers, unlocked, wrapped] = await Promise.all([
        db.select({ id: players.id, displayName: players.displayName }).from(players).orderBy(asc(players.displayName)),
        wrappedUnlocked(),
        // Admins can always preview, even before the public unlock.
        computeAllWrappedForPreview(),
    ]);

    return (
        <main className="mx-auto max-w-3xl px-6 py-8">
            <header className="flex items-baseline justify-between">
                <h1 className="font-display text-2xl uppercase tracking-widest">Admin · Wrapped</h1>
                <Link href="/admin/dashboard" className="text-xs underline opacity-60 hover:text-tournament">
                    ← dashboard
                </Link>
            </header>

            <p className="mt-2 text-xs opacity-60">
                Preview each player&apos;s World Cup Wrapped. Public unlock is{" "}
                <span className={unlocked ? "text-pitch" : "text-tournament"}>
                    {unlocked ? "live" : "not yet live"}
                </span>{" "}
                — as admin you can preview regardless.
            </p>

            <div className="mt-4">
                <RebuildAllWrappedButton />
                <p className="mt-1 text-[11px] opacity-50">
                    Clears every frozen Wrapped payload so the next open recomputes each player&apos;s
                    story from live data. Safe to run before the tournament ends.
                </p>
            </div>

            <ul className="mt-6 divide-y divide-ink/15 text-sm">
                {allPlayers.map((p) => {
                    const w = wrapped.get(p.id);
                    return (
                        <li key={p.id} className="flex items-center justify-between py-3">
                            <div>
                                <div className="font-medium">{p.displayName}</div>
                                <div className="font-display text-[11px] uppercase tracking-wider opacity-60">
                                    {w !== undefined ? PERSONA_TITLE[w.persona] ?? w.persona : "—"}
                                    {w !== undefined ? ` · ${w.totalPoints} pts` : ""}
                                </div>
                            </div>
                            <Link
                                href={`/wrapped/${p.id}?preview=1` as never}
                                className="rounded border border-ink/30 px-3 py-1.5 font-display text-[11px] uppercase tracking-wider hover:border-tournament hover:text-tournament"
                            >
                                view wrapped →
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </main>
    );
}
