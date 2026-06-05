import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bonusPicks, settings, teams } from "@/db/schema";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { TeamBonusPicker } from "./_components/team-bonus-picker";
import { PlayerNameBonusPicker } from "./_components/player-name-bonus-picker";
import { formatKickoff } from "@/lib/utils";

export const revalidate = 30;

export default async function BonusesPage() {
    const session = await requireSession();

    const [allTeams, mySetting, myBonuses] = await Promise.all([
        db.select().from(teams).orderBy(asc(teams.name)),
        db.select().from(settings).where(eq(settings.id, 1)).limit(1),
        db.select().from(bonusPicks).where(eq(bonusPicks.playerId, session.playerId)),
    ]);

    const tournamentKickoff = mySetting[0]?.tournamentKickoff;
    const locked = tournamentKickoff !== undefined && tournamentKickoff.getTime() <= Date.now();

    const teamOpts = allTeams.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        groupLetter: t.groupLetter,
        pot: t.pot,
    }));

    // Dark horse: only teams NOT in Pot 1 are eligible. If pot data hasn't been
    // populated yet (run scripts/set-pots.ts), fall back to all teams.
    const anyPotMarked = teamOpts.some((t) => t.pot !== null);
    const darkHorseOpts = anyPotMarked
        ? teamOpts.filter((t) => t.pot !== 1)
        : teamOpts;
    // Mighty fallen: only Pot 1 teams. Same fallback.
    const mightyFallenOpts = anyPotMarked
        ? teamOpts.filter((t) => t.pot === 1)
        : teamOpts;

    const findBonus = (kind: string) => myBonuses.find((b) => b.kind === kind);

    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-3xl px-6 py-8">
                <header className="flex items-baseline justify-between">
                    <h1 className="font-display text-2xl uppercase tracking-widest">Bonuses</h1>
                    <span className="font-display text-xs uppercase opacity-60">
                        {locked
                            ? "locked at kickoff 🔒"
                            : tournamentKickoff !== undefined
                              ? `lock: ${formatKickoff(tournamentKickoff)}`
                              : ""}
                    </span>
                </header>
                <p className="mt-1 text-xs opacity-60">
                    All bonuses lock at the tournament&apos;s opening whistle. Auto-saves as you change.
                </p>

                <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <TeamBonusPicker
                        kind="WINNER"
                        label="Tournament winner"
                        points="25 pts"
                        description="Pick the team that lifts the trophy. All-or-nothing."
                        options={teamOpts}
                        selectedTeamId={findBonus("WINNER")?.teamId ?? null}
                        locked={locked}
                    />
                    <TeamBonusPicker
                        kind="DARK_HORSE"
                        label="Dark horse"
                        points="up to 57 pts"
                        description="A non-Pot-1 team. Cumulative payout: 2 / 6 / 12 / 22 / 37 / 57 as they survive each round."
                        options={darkHorseOpts}
                        selectedTeamId={findBonus("DARK_HORSE")?.teamId ?? null}
                        locked={locked}
                    />
                    <TeamBonusPicker
                        kind="WOODEN_SPOON"
                        label="Wooden spoon"
                        points="5 pts"
                        description="Team finishing bottom of their group with the worst record overall."
                        options={teamOpts}
                        selectedTeamId={findBonus("WOODEN_SPOON")?.teamId ?? null}
                        locked={locked}
                    />
                    <PlayerNameBonusPicker
                        kind="TOP_SCORER"
                        label="Golden Boot"
                        points="10 pts"
                        description="Tournament's top scorer. Shared boot? Everyone who picked any joint winner gets 10."
                        initialName={findBonus("TOP_SCORER")?.playerName ?? null}
                        locked={locked}
                    />
                </section>

                <section className="mt-10">
                    <header>
                        <h2 className="font-display text-sm uppercase tracking-wider">Hall of Shame</h2>
                        <p className="mt-1 text-xs opacity-60">
                            Anti-bonuses — pick the teams you think will excel at being rubbish.
                        </p>
                    </header>
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <TeamBonusPicker
                            kind="PANTOMIME_VILLAIN"
                            label="Pantomime villain"
                            points="5 pts"
                            description="Team that picks up the most yellow + red cards across the tournament."
                            options={teamOpts}
                            selectedTeamId={findBonus("PANTOMIME_VILLAIN")?.teamId ?? null}
                            locked={locked}
                        />
                        <TeamBonusPicker
                            kind="SIEVE"
                            label="The Sieve"
                            points="5 pts"
                            description="Team that concedes the most goals overall."
                            options={teamOpts}
                            selectedTeamId={findBonus("SIEVE")?.teamId ?? null}
                            locked={locked}
                        />
                        <TeamBonusPicker
                            kind="MIGHTY_FALLEN"
                            label="How the mighty have fallen"
                            points="8 pts"
                            description="A Pot-1 (top-seeded) team that fails to make the knockouts. Bigger pay-out for backing chaos. If every Pot-1 team advances, no points are awarded."
                            options={mightyFallenOpts}
                            selectedTeamId={findBonus("MIGHTY_FALLEN")?.teamId ?? null}
                            locked={locked}
                        />
                    </div>
                </section>
            </main>
        </>
    );
}
