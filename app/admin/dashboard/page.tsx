import { count, desc } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db/client";
import { auditLog, matches, players } from "@/db/schema";
import { adminLogoutAction } from "@/app/actions/auth";
import { requireAdmin } from "@/lib/auth";
import { SyncNowButton } from "./_sync-now-button";

export const revalidate = 0;

export default async function AdminDashboardPage() {
    await requireAdmin();
    const [[playerCount], [matchCount], recentLog] = await Promise.all([
        db.select({ c: count() }).from(players),
        db.select({ c: count() }).from(matches),
        db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(50),
    ]);

    return (
        <main className="mx-auto max-w-3xl px-6 py-8">
            <header className="flex items-baseline justify-between">
                <h1 className="font-display text-2xl uppercase tracking-widest">Admin · Dashboard</h1>
                <form action={adminLogoutAction}>
                    <button className="text-xs opacity-60 hover:text-tournament">log out</button>
                </form>
            </header>

            <section className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
                <Stat label="Players" value={playerCount.c} />
                <Stat label="Matches" value={matchCount.c} />
            </section>

            <section className="mt-10">
                <h2 className="font-display text-sm uppercase tracking-wider">Tools</h2>
                <ul className="mt-3 space-y-2 text-sm">
                    <li>
                        <Link href="/admin/matches" className="underline">
                            Score override editor
                        </Link>{" "}
                        — adjust any match score; marks it as admin-overridden so cron won&apos;t clobber.
                    </li>
                    <li>
                        <Link href={"/admin/bonuses" as never} className="underline">
                            Bonus resolution editor
                        </Link>{" "}
                        — set the resolved value for each bonus (winner, golden boot, sieve, etc.). Drives bonus payouts on the leaderboard.
                    </li>
                    <li>
                        <div className="mb-2">Trigger results sync:</div>
                        <SyncNowButton />
                    </li>
                </ul>
            </section>

            <section className="mt-10">
                <h2 className="font-display text-sm uppercase tracking-wider">Recent activity</h2>
                <ul className="mt-3 divide-y divide-ink/15 text-sm">
                    {recentLog.length === 0 ? (
                        <li className="py-4 text-xs opacity-60">No log entries yet.</li>
                    ) : (
                        recentLog.map((l) => (
                            <li key={l.id} className="flex items-baseline gap-3 py-2">
                                <span className="w-40 font-display text-xs opacity-50">
                                    {l.at.toISOString().replace("T", " ").slice(0, 19)}
                                </span>
                                <span className="w-20 font-display text-xs uppercase opacity-70">{l.actor}</span>
                                <span>{l.action}</span>
                                {l.detail !== null ? (
                                    <span className="ml-2 text-xs opacity-50">{l.detail}</span>
                                ) : null}
                            </li>
                        ))
                    )}
                </ul>
            </section>

            <section className="mt-10">
                <h2 className="font-display text-sm uppercase tracking-wider">TODO</h2>
                <ul className="mt-3 list-disc pl-6 text-sm opacity-80">
                    <li>Player management (rename, remove, add late joiner)</li>
                    <li>Invite-code rotation in-app</li>
                </ul>
            </section>
        </main>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded border border-ink/20 p-4">
            <div className="font-display text-xs uppercase tracking-widest opacity-60">{label}</div>
            <div className="mt-1 font-display text-3xl tabular">{value}</div>
        </div>
    );
}
