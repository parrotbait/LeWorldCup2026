import type { LiveLeader } from "@/lib/live-leaders";
import { flag } from "@/lib/utils";

/**
 * Renders the resolved outcome of a bonus once admin (or `pnpm sim resolve`)
 * has filled in `bonus_resolutions`. Shows the winner(s) plus a
 * "+pts you got it" / "missed" indicator scoped to the viewing player's pick.
 */
interface ResolvedTeam {
    id: number;
    code: string;
    name: string;
}

interface Props {
    /** Resolved winning team IDs (team-bound bonuses). */
    winnerTeamIds?: number[];
    /** Resolved winning player names (player-stat bonuses, canonical "LAST First"). */
    winnerPlayerNames?: string[];
    /** Map of team id → resolved team for rendering names + flags. */
    teamLookup?: Map<number, ResolvedTeam>;
    /** Subject pluralisation for the tied-many copy. */
    subjectPlural: "players" | "teams";
    /** The viewer's own pick — used to render the "you got it" / "missed" tag. */
    myPickTeamId?: number | null;
    myPickPlayerName?: string | null;
    /** Points the viewer earned on this bonus, computed by the caller. */
    earnedPoints?: number;
}

function normalize(s: string): string {
    return s
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase();
}

export function BonusResultChip(props: Props) {
    const {
        winnerTeamIds,
        winnerPlayerNames,
        teamLookup,
        subjectPlural,
        myPickTeamId,
        myPickPlayerName,
        earnedPoints,
    } = props;

    const teams = (winnerTeamIds ?? [])
        .map((id) => teamLookup?.get(id))
        .filter((t): t is ResolvedTeam => t !== undefined);
    const players = winnerPlayerNames ?? [];

    const hasTeams = teams.length > 0;
    const hasPlayers = players.length > 0;
    if (!hasTeams && !hasPlayers) {
        return null;
    }

    const matchedTeam =
        myPickTeamId !== null &&
        myPickTeamId !== undefined &&
        winnerTeamIds !== undefined &&
        winnerTeamIds.includes(myPickTeamId);
    const matchedPlayer =
        myPickPlayerName !== null &&
        myPickPlayerName !== undefined &&
        winnerPlayerNames !== undefined &&
        winnerPlayerNames.some((n) => normalize(n) === normalize(myPickPlayerName));

    const matched = matchedTeam || matchedPlayer;
    const tone = matched ? "text-pitch" : "opacity-60";
    const baseClass = "mt-1 font-display text-[11px] uppercase tracking-wider";

    return (
        <p className={`${baseClass} ${tone}`}>
            <span className="opacity-50">winner:</span>{" "}
            {hasTeams ? (
                teams.length === 1 ? (
                    <span className="font-medium normal-case tracking-normal">
                        <span className="mr-1" aria-hidden>{flag(teams[0]!.code)}</span>
                        {teams[0]!.name}
                    </span>
                ) : teams.length === 2 ? (
                    <span className="font-medium normal-case tracking-normal">
                        {teams[0]!.name} &amp; {teams[1]!.name}
                    </span>
                ) : (
                    <span className="font-medium normal-case tracking-normal">
                        {teams.length} {subjectPlural} tied
                    </span>
                )
            ) : players.length === 1 ? (
                <span className="font-medium normal-case tracking-normal">{players[0]}</span>
            ) : players.length === 2 ? (
                <span className="font-medium normal-case tracking-normal">
                    {players[0]} &amp; {players[1]}
                </span>
            ) : (
                <span className="font-medium normal-case tracking-normal">
                    {players.length} {subjectPlural} tied
                </span>
            )}
            {earnedPoints !== undefined && earnedPoints > 0 ? (
                <span className="ml-2 font-bold">+{earnedPoints} you got it</span>
            ) : matched ? (
                <span className="ml-2 font-bold">you got it</span>
            ) : (
                <span className="ml-2 opacity-50">missed</span>
            )}
        </p>
    );
}

// Re-export LiveLeader so importers don't need two imports.
export type { LiveLeader };
