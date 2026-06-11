import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db/client";
import { bonusPicks, bonusResolutions, matches, players, teams } from "@/db/schema";
import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";
import { TeamBonusPicker } from "./_components/team-bonus-picker";
import { PlayerNameBonusPicker } from "./_components/player-name-bonus-picker";
import { LiveLeaderChip } from "./_components/live-leader-chip";
import { BonusResultChip } from "./_components/bonus-result-chip";
import { AllPicksList, type AllPicksGroup } from "./_components/all-picks-list";
import { formatKickoff } from "@/lib/utils";
import { getBonusLockState } from "@/lib/bonus-lock";
import { allRosterPlayers } from "@/lib/players";import {
    getDarkHorseLeader,
    getMightyFallenLeader,
    getMostAssistsLeader,
    getPantomimeVillainLeader,
    getSieveLeader,
    getTopScorerLeader,
    getWoodenSpoonLeader,
    type LiveLeader,
} from "@/lib/live-leaders";

// 5-minute window so each request rendering /bonuses doesn't spam the
// football-data /scorers endpoint. Cron's revalidateTag busts this on the
// next sync.
export const revalidate = 300;

export default async function BonusesPage() {
    const session = await requireSession();

    const [
        allTeams,
        lockState,
        myBonuses,
        allPicksWithPlayers,
        allResolutions,
        finalRow,
        topScorerLeader,
        mostAssistsLeader,
        darkHorseLeader,
        sieveLeader,
        woodenSpoonLeader,
        mightyFallenLeader,
        pantomimeVillainLeader,
    ] = await Promise.all([
        db.select().from(teams).orderBy(asc(teams.name)),
        getBonusLockState(),
        db.select().from(bonusPicks).where(eq(bonusPicks.playerId, session.playerId)),
        db
            .select({
                kind: bonusPicks.kind,
                teamId: bonusPicks.teamId,
                playerName: bonusPicks.playerName,
                pickerId: players.id,
                pickerDisplayName: players.displayName,
            })
            .from(bonusPicks)
            .innerJoin(players, eq(bonusPicks.playerId, players.id))
            .where(eq(bonusPicks.groupLetter, ""))
            .orderBy(asc(players.displayName)),
        db.select().from(bonusResolutions),
        db
            .select({ status: matches.status })
            .from(matches)
            .where(eq(matches.round, "FINAL"))
            .limit(1),
        getTopScorerLeader(),
        getMostAssistsLeader(),
        getDarkHorseLeader(),
        getSieveLeader(),
        getWoodenSpoonLeader(),
        getMightyFallenLeader(),
        getPantomimeVillainLeader(),
    ]);

    const { locked, deadline } = lockState;

    // Bonus results are tournament-end facts. Even if admin pre-populates a
    // resolution row, we only render it as "winner" once the FINAL match has
    // actually been played. Until then the live-leader chip carries the
    // story.
    const tournamentComplete =
        finalRow[0] !== undefined && finalRow[0].status === "FINISHED";

    const teamLookup = new Map(
        allTeams.map((t) => [t.id, { id: t.id, code: t.code, name: t.name }]),
    );
    const findResolution = (kind: string) => {
        if (!tournamentComplete) {
            // Bonuses don't crystallize until the FINAL has been played. Even
            // if a resolution row exists (admin pre-populated, sim ran),
            // suppress it from the UI so the live-leader chip carries the
            // story until full-time of the final.
            return undefined;
        }
        return allResolutions.find((r) => r.kind === kind && r.groupLetter === "");
    };

    // Fixed-payout bonuses. DARK_HORSE pays a stage-derived amount which we
    // don't recompute here — the chip just shows "you got it" without a
    // number; the leaderboard surfaces the actual total.
    const FIXED_POINTS: Record<string, number> = {
        WINNER: 25,
        TOP_SCORER: 10,
        MOST_ASSISTS: 10,
        WOODEN_SPOON: 5,
        PANTOMIME_VILLAIN: 5,
        SIEVE: 5,
        MIGHTY_FALLEN: 8,
    };

    const norm = (s: string): string =>
        s
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLocaleLowerCase();

    const earnedFor = (kind: string): number | undefined => {
        const pick = findBonus(kind);
        const res = findResolution(kind);
        if (pick === undefined || res === undefined) {
            return undefined;
        }
        const matchedTeam =
            pick.teamId !== null && pick.teamId !== undefined && res.teamIds.includes(pick.teamId);
        const matchedPlayer =
            pick.playerName !== null &&
            pick.playerName !== undefined &&
            res.playerNames.some((n) => norm(n) === norm(pick.playerName!));
        if (!matchedTeam && !matchedPlayer) {
            return 0;
        }
        return FIXED_POINTS[kind];
    };

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

    // After tournament kickoff, expose every player's pick under each card so
    // people can scout consensus picks vs contrarian ones. Hidden pre-lock so
    // late-fillers can't peek. Group by the picked subject, popularity-first.
    const allPicksByKind = new Map<string, AllPicksGroup[]>();
    if (locked) {
        const buckets = new Map<string, Map<string, AllPicksGroup>>();
        for (const row of allPicksWithPlayers) {
            let label: string;
            let teamCode: string | undefined;
            if (row.teamId !== null) {
                const team = teamLookup.get(row.teamId);
                if (team === undefined) {
                    continue;
                }
                label = team.name;
                teamCode = team.code;
            } else if (row.playerName !== null) {
                label = row.playerName;
            } else {
                continue;
            }
            let kindBucket = buckets.get(row.kind);
            if (kindBucket === undefined) {
                kindBucket = new Map();
                buckets.set(row.kind, kindBucket);
            }
            const key = label.toLocaleLowerCase();
            let group = kindBucket.get(key);
            if (group === undefined) {
                group = { label, teamCode, pickers: [] };
                kindBucket.set(key, group);
            }
            group.pickers.push({
                playerId: row.pickerId,
                displayName: row.pickerDisplayName,
                isMe: row.pickerId === session.playerId,
            });
        }
        for (const [kind, bucket] of buckets) {
            const groups = Array.from(bucket.values()).sort((a, b) => {
                if (b.pickers.length !== a.pickers.length) {
                    return b.pickers.length - a.pickers.length;
                }
                return a.label.localeCompare(b.label);
            });
            allPicksByKind.set(kind, groups);
        }
    }
    const picksFor = (kind: string): AllPicksGroup[] | undefined =>
        locked ? (allPicksByKind.get(kind) ?? []) : undefined;

    const rosterOpts = allRosterPlayers().map((p) => ({
        displayName: p.displayName,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        teamCode: p.teamCode,
        teamName: p.teamName,
    }));

    const goalsLabel = (n: number): string => `${n} goal${n === 1 ? "" : "s"}`;
    const assistsLabel = (n: number): string => `${n} assist${n === 1 ? "" : "s"}`;
    const concededLabel = (n: number): string => `${n} conceded`;

    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
                <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <h1 className="font-display text-2xl uppercase tracking-widest">Bonuses</h1>
                    <span className="font-display text-xs uppercase opacity-60">
                        {locked
                            ? "locked 🔒"
                            : deadline !== null
                              ? `lock: ${formatKickoff(deadline)}`
                              : ""}
                    </span>
                </header>
                <p className="mt-1 text-xs opacity-60">
                    Grace window: bonuses stay open for 24 hours after the opening kickoff. Ties pay
                    everyone the full bonus.{" "}
                    <Link href={"/stats" as never} className="underline hover:text-tournament">
                        See live stats →
                    </Link>
                </p>

                <section className="mt-8">
                    <h2 className="font-display text-sm uppercase tracking-[0.25em] text-tournament">
                        Teams
                    </h2>
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <TeamBonusCard
                            leader={null}
                            resolution={findResolution("WINNER")}
                            teamLookup={teamLookup}
                            myPickTeamId={findBonus("WINNER")?.teamId ?? null}
                            earnedPoints={earnedFor("WINNER")}
                            allPicks={picksFor("WINNER")}
                        >
                            <TeamBonusPicker
                                kind="WINNER"
                                label="Tournament winner"
                                points="25 pts"
                                description="Pick the team that lifts the trophy. All-or-nothing."
                                options={teamOpts}
                                selectedTeamId={findBonus("WINNER")?.teamId ?? null}
                                locked={locked}
                            />
                        </TeamBonusCard>
                        <TeamBonusCard
                            leader={darkHorseLeader}
                            subjectPlural="teams"
                            resolution={findResolution("DARK_HORSE")}
                            teamLookup={teamLookup}
                            myPickTeamId={findBonus("DARK_HORSE")?.teamId ?? null}
                            allPicks={picksFor("DARK_HORSE")}
                        >
                            <TeamBonusPicker
                                kind="DARK_HORSE"
                                label="Dark horse"
                                points="up to 57 pts"
                                description="A non-Pot-1 team. Cumulative payout: 2 / 6 / 12 / 22 / 37 / 57 as they survive each round."
                                options={darkHorseOpts}
                                selectedTeamId={findBonus("DARK_HORSE")?.teamId ?? null}
                                locked={locked}
                            />
                        </TeamBonusCard>
                        <TeamBonusCard
                            leader={woodenSpoonLeader}
                            subjectPlural="teams"
                            resolution={findResolution("WOODEN_SPOON")}
                            teamLookup={teamLookup}
                            myPickTeamId={findBonus("WOODEN_SPOON")?.teamId ?? null}
                            earnedPoints={earnedFor("WOODEN_SPOON")}
                            allPicks={picksFor("WOODEN_SPOON")}
                        >
                            <TeamBonusPicker
                                kind="WOODEN_SPOON"
                                label="Wooden spoon"
                                points="5 pts"
                                badge="AVOID"
                                description="Team finishing bottom of their group with the worst record overall."
                                options={teamOpts}
                                selectedTeamId={findBonus("WOODEN_SPOON")?.teamId ?? null}
                                locked={locked}
                            />
                        </TeamBonusCard>
                        <TeamBonusCard
                            leader={pantomimeVillainLeader}
                            subjectPlural="teams"
                            resolution={findResolution("PANTOMIME_VILLAIN")}
                            teamLookup={teamLookup}
                            myPickTeamId={findBonus("PANTOMIME_VILLAIN")?.teamId ?? null}
                            earnedPoints={earnedFor("PANTOMIME_VILLAIN")}
                            allPicks={picksFor("PANTOMIME_VILLAIN")}
                        >
                            <TeamBonusPicker
                                kind="PANTOMIME_VILLAIN"
                                label="Pantomime villain"
                                points="5 pts"
                                badge="AVOID"
                                description="Team that picks up the most yellow + red cards across the tournament."
                                options={teamOpts}
                                selectedTeamId={findBonus("PANTOMIME_VILLAIN")?.teamId ?? null}
                                locked={locked}
                            />
                        </TeamBonusCard>
                        <TeamBonusCard
                            leader={sieveLeader}
                            subjectPlural="teams"
                            metricLabel={concededLabel}
                            resolution={findResolution("SIEVE")}
                            teamLookup={teamLookup}
                            myPickTeamId={findBonus("SIEVE")?.teamId ?? null}
                            earnedPoints={earnedFor("SIEVE")}
                            allPicks={picksFor("SIEVE")}
                        >
                            <TeamBonusPicker
                                kind="SIEVE"
                                label="The Sieve"
                                points="5 pts"
                                badge="AVOID"
                                description="Team that concedes the most goals overall."
                                options={teamOpts}
                                selectedTeamId={findBonus("SIEVE")?.teamId ?? null}
                                locked={locked}
                            />
                        </TeamBonusCard>
                        <TeamBonusCard
                            leader={mightyFallenLeader}
                            subjectPlural="teams"
                            resolution={findResolution("MIGHTY_FALLEN")}
                            teamLookup={teamLookup}
                            myPickTeamId={findBonus("MIGHTY_FALLEN")?.teamId ?? null}
                            earnedPoints={earnedFor("MIGHTY_FALLEN")}
                            allPicks={picksFor("MIGHTY_FALLEN")}
                        >
                            <TeamBonusPicker
                                kind="MIGHTY_FALLEN"
                                label="How the mighty have fallen"
                                points="8 pts"
                                badge="AVOID"
                                description="A Pot-1 (top-seeded) team that fails to make the knockouts. Bigger pay-out for backing chaos."
                                options={mightyFallenOpts}
                                selectedTeamId={findBonus("MIGHTY_FALLEN")?.teamId ?? null}
                                locked={locked}
                            />
                        </TeamBonusCard>
                    </div>
                </section>

                <section className="mt-10">
                    <h2 className="font-display text-sm uppercase tracking-[0.25em] text-tournament">
                        Players
                    </h2>
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <PlayerBonusCard
                            leader={topScorerLeader}
                            metricLabel={goalsLabel}
                            resolution={findResolution("TOP_SCORER")}
                            myPickPlayerName={findBonus("TOP_SCORER")?.playerName ?? null}
                            earnedPoints={earnedFor("TOP_SCORER")}
                            allPicks={picksFor("TOP_SCORER")}
                        >
                            <PlayerNameBonusPicker
                                kind="TOP_SCORER"
                                label="Golden Boot"
                                points="10 pts"
                                description="Tournament's top scorer. Shared boot? Everyone who picked any joint winner gets the full 10."
                                initialName={findBonus("TOP_SCORER")?.playerName ?? null}
                                locked={locked}
                                roster={rosterOpts}
                            />
                        </PlayerBonusCard>
                        <PlayerBonusCard
                            leader={mostAssistsLeader}
                            metricLabel={assistsLabel}
                            resolution={findResolution("MOST_ASSISTS")}
                            myPickPlayerName={findBonus("MOST_ASSISTS")?.playerName ?? null}
                            earnedPoints={earnedFor("MOST_ASSISTS")}
                            allPicks={picksFor("MOST_ASSISTS")}
                        >
                            <PlayerNameBonusPicker
                                kind="MOST_ASSISTS"
                                label="Most Assists"
                                points="10 pts"
                                description="Tournament's top assister. Joint winners share the full 10 each."
                                initialName={findBonus("MOST_ASSISTS")?.playerName ?? null}
                                locked={locked}
                                roster={rosterOpts}
                            />
                        </PlayerBonusCard>
                    </div>
                </section>
            </main>
        </>
    );
}

function PlayerBonusCard({
    children,
    leader,
    metricLabel,
    resolution,
    myPickPlayerName,
    earnedPoints,
    allPicks,
}: {
    children: React.ReactNode;
    leader: LiveLeader;
    metricLabel: (n: number) => string;
    resolution?: { teamIds: number[]; playerNames: string[] } | undefined;
    myPickPlayerName?: string | null;
    earnedPoints?: number;
    allPicks?: AllPicksGroup[];
}) {
    const resolved = resolution !== undefined && resolution.playerNames.length > 0;
    return (
        <div className="flex flex-col">
            {children}
            {resolved ? (
                <BonusResultChip
                    winnerPlayerNames={resolution.playerNames}
                    subjectPlural="players"
                    myPickPlayerName={myPickPlayerName ?? null}
                    earnedPoints={earnedPoints}
                />
            ) : (
                <LiveLeaderChip leader={leader} subjectPlural="players" metricLabel={metricLabel} />
            )}
            {allPicks !== undefined ? <AllPicksList groups={allPicks} /> : null}
        </div>
    );
}

function TeamBonusCard({
    children,
    leader,
    subjectPlural = "teams",
    metricLabel,
    resolution,
    teamLookup,
    myPickTeamId,
    earnedPoints,
    allPicks,
}: {
    children: React.ReactNode;
    leader: LiveLeader | null;
    subjectPlural?: "players" | "teams";
    metricLabel?: (n: number) => string;
    resolution?: { teamIds: number[]; playerNames: string[] } | undefined;
    teamLookup?: Map<number, { id: number; code: string; name: string }>;
    myPickTeamId?: number | null;
    earnedPoints?: number;
    allPicks?: AllPicksGroup[];
}) {
    const resolved = resolution !== undefined && resolution.teamIds.length > 0;
    return (
        <div className="flex flex-col">
            {children}
            {resolved ? (
                <BonusResultChip
                    winnerTeamIds={resolution.teamIds}
                    teamLookup={teamLookup}
                    subjectPlural={subjectPlural}
                    myPickTeamId={myPickTeamId ?? null}
                    earnedPoints={earnedPoints}
                />
            ) : leader !== null ? (
                <LiveLeaderChip leader={leader} subjectPlural={subjectPlural} metricLabel={metricLabel} />
            ) : null}
            {allPicks !== undefined ? <AllPicksList groups={allPicks} /> : null}
        </div>
    );
}
