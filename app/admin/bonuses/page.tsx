import { asc } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db/client";
import { bonusResolutions, teams } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { allRosterPlayers } from "@/lib/players";
import { TeamResolutionEditor } from "./_team-resolution-editor";
import { PlayerNameResolutionEditor } from "./_player-name-resolution-editor";

export const revalidate = 0;

export default async function AdminBonusesPage() {
    await requireAdmin();
    const [allTeams, allResolutions] = await Promise.all([
        db.select().from(teams).orderBy(asc(teams.name)),
        db.select().from(bonusResolutions),
    ]);

    const teamOpts = allTeams.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        groupLetter: t.groupLetter,
    }));

    const find = (kind: string) =>
        allResolutions.find((r) => r.kind === kind && r.groupLetter === "");

    return (
        <main className="mx-auto max-w-5xl px-6 py-8">
            <header className="flex items-baseline justify-between">
                <h1 className="font-display text-2xl uppercase tracking-widest">
                    Admin · Bonus resolutions
                </h1>
                <Link href="/admin/dashboard" className="text-xs underline">
                    ← dashboard
                </Link>
            </header>
            <p className="mt-2 text-sm opacity-70">
                Set the resolved value(s) for each bonus. Multiple selections = a tie; everyone who
                picked any tied option collects.
            </p>
            <p className="mt-1 text-xs opacity-60">
                Dark horse is auto-derived from match progression — no editor needed here.
            </p>

            <section className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TeamResolutionEditor
                    kind="WINNER"
                    label="Tournament winner"
                    points="25 pts"
                    description="Set the winning team."
                    options={teamOpts}
                    selectedTeamIds={find("WINNER")?.teamIds ?? []}
                />
                <PlayerNameResolutionEditor
                    kind="TOP_SCORER"
                    label="Golden Boot"
                    points="10 pts"
                    description="Top scorer(s). Click to add joint winners; click × to remove."
                    initialNames={find("TOP_SCORER")?.playerNames ?? []}
                    roster={allRosterPlayers().map((p) => ({
                        displayName: p.displayName,
                        firstName: p.firstName,
                        lastName: p.lastName,
                        position: p.position,
                        teamCode: p.teamCode,
                        teamName: p.teamName,
                    }))}
                />
                <PlayerNameResolutionEditor
                    kind="MOST_ASSISTS"
                    label="Most Assists"
                    points="10 pts"
                    description="Top assister(s). Same rules — joint winners share the full points."
                    initialNames={find("MOST_ASSISTS")?.playerNames ?? []}
                    roster={allRosterPlayers().map((p) => ({
                        displayName: p.displayName,
                        firstName: p.firstName,
                        lastName: p.lastName,
                        position: p.position,
                        teamCode: p.teamCode,
                        teamName: p.teamName,
                    }))}
                />
                <TeamResolutionEditor
                    kind="WOODEN_SPOON"
                    label="Wooden spoon"
                    points="5 pts"
                    description="Worst-performing team across the group stage."
                    options={teamOpts}
                    selectedTeamIds={find("WOODEN_SPOON")?.teamIds ?? []}
                />
                <TeamResolutionEditor
                    kind="PANTOMIME_VILLAIN"
                    label="Pantomime villain"
                    points="5 pts"
                    description="Most yellow + red cards across the tournament."
                    options={teamOpts}
                    selectedTeamIds={find("PANTOMIME_VILLAIN")?.teamIds ?? []}
                />
                <TeamResolutionEditor
                    kind="SIEVE"
                    label="The Sieve"
                    points="5 pts"
                    description="Most goals conceded overall."
                    options={teamOpts}
                    selectedTeamIds={find("SIEVE")?.teamIds ?? []}
                />
                <TeamResolutionEditor
                    kind="MIGHTY_FALLEN"
                    label="How the mighty have fallen"
                    points="8 pts"
                    description="Pot-1 team(s) eliminated in the group stage."
                    options={teamOpts}
                    selectedTeamIds={find("MIGHTY_FALLEN")?.teamIds ?? []}
                />
            </section>
        </main>
    );
}
