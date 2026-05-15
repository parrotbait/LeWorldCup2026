import { asc } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db/client";
import { bonusResolutions, teams } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { TeamResolutionEditor } from "./_team-resolution-editor";
import { PlayerNameResolutionEditor } from "./_player-name-resolution-editor";

export const revalidate = 0;

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

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

    const find = (kind: string, group = "") =>
        allResolutions.find((r) => r.kind === kind && r.groupLetter === group);

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
                    description="Top scorer name(s). Joint winners go in comma-separated."
                    initialNames={find("TOP_SCORER")?.playerNames ?? []}
                />
                <PlayerNameResolutionEditor
                    kind="FIRST_GOAL_SCORER"
                    label="First goal scorer"
                    points="5 pts"
                    description="Whoever scored the first non-own-goal of the tournament."
                    initialNames={find("FIRST_GOAL_SCORER")?.playerNames ?? []}
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

            <section className="mt-10">
                <h2 className="font-display text-sm uppercase tracking-wider">Group winners</h2>
                <p className="mt-1 text-xs opacity-60">3 pts each. Tied? Tick multiple.</p>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {GROUPS.map((g) => {
                        const groupTeams = teamOpts.filter((t) => t.groupLetter === g);
                        if (groupTeams.length === 0) {
                            return (
                                <div
                                    key={g}
                                    className="rounded border border-dashed border-ink/20 p-3 text-xs opacity-50"
                                >
                                    Group {g} — teams not yet loaded
                                </div>
                            );
                        }
                        return (
                            <TeamResolutionEditor
                                key={g}
                                kind="GROUP_WINNER"
                                label={`Group ${g}`}
                                points="3 pts"
                                description=""
                                options={groupTeams}
                                groupLetter={g}
                                selectedTeamIds={find("GROUP_WINNER", g)?.teamIds ?? []}
                            />
                        );
                    })}
                </div>
            </section>
        </main>
    );
}
