/**
 * Local tournament simulator.
 *
 * Drives the whole game loop end-to-end against your local Postgres so you
 * can verify everything works before the real tournament starts. Seeded RNG
 * means a given seed always produces the same scenario.
 *
 *   pnpm sim reset                       — wipe all sim data
 *   pnpm sim setup [--seed=N] [--players=12]
 *   pnpm sim play [--up-to=GROUP|R32|R16|QF|SF|FINAL]
 *   pnpm sim resolve                     — set bonus resolutions from actual outcomes
 *   pnpm sim leaderboard                 — print current standings
 *   pnpm sim run [--seed=N] [--players=12]   — reset + setup + play full + resolve + print
 *
 * `play` is incremental: re-running it advances the next unfinished round.
 */

import "./_load-env";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
    auditLog,
    bonusPicks,
    bonusResolutions,
    jokers,
    matches,
    players,
    predictions,
    settings,
    teams,
} from "../db/schema";
import {
    BONUS_POINTS,
    buildLeaderboard,
    computeBonusPointsByPlayer,
    type Round,
} from "../lib/scoring";

// ---------------------------------------------------------------------------
// Args + tiny seeded RNG (Mulberry32 — fine for sim, not for crypto).
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const a of argv) {
        const m = /^--([^=]+)=(.*)$/.exec(a);
        if (m !== null) {
            out[m[1]!] = m[2]!;
        } else if (a.startsWith("--")) {
            out[a.slice(2)] = "true";
        }
    }
    return out;
}

function rngFromSeed(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const intIn = (rng: () => number, lo: number, hi: number): number =>
    Math.floor(rng() * (hi - lo + 1)) + lo;
const pick = <T>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;

function shuffle<T>(rng: () => number, arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
}

// ---------------------------------------------------------------------------
// Synthetic tournament data
// ---------------------------------------------------------------------------

const SIM_TEAMS: { code: string; name: string; pot: number }[] = [
    // 48 plausible WC 2026 entrants. Pots are illustrative.
    { code: "MEX", name: "Mexico", pot: 1 },
    { code: "CAN", name: "Canada", pot: 1 },
    { code: "USA", name: "United States", pot: 1 },
    { code: "ARG", name: "Argentina", pot: 1 },
    { code: "FRA", name: "France", pot: 1 },
    { code: "BRA", name: "Brazil", pot: 1 },
    { code: "ENG", name: "England", pot: 1 },
    { code: "GER", name: "Germany", pot: 1 },
    { code: "ESP", name: "Spain", pot: 1 },
    { code: "POR", name: "Portugal", pot: 1 },
    { code: "NED", name: "Netherlands", pot: 1 },
    { code: "BEL", name: "Belgium", pot: 1 },
    { code: "ITA", name: "Italy", pot: 2 },
    { code: "CRO", name: "Croatia", pot: 2 },
    { code: "URU", name: "Uruguay", pot: 2 },
    { code: "COL", name: "Colombia", pot: 2 },
    { code: "JPN", name: "Japan", pot: 2 },
    { code: "KOR", name: "South Korea", pot: 2 },
    { code: "AUS", name: "Australia", pot: 2 },
    { code: "MAR", name: "Morocco", pot: 2 },
    { code: "SEN", name: "Senegal", pot: 2 },
    { code: "EGY", name: "Egypt", pot: 2 },
    { code: "DEN", name: "Denmark", pot: 2 },
    { code: "SUI", name: "Switzerland", pot: 2 },
    { code: "AUT", name: "Austria", pot: 3 },
    { code: "POL", name: "Poland", pot: 3 },
    { code: "SRB", name: "Serbia", pot: 3 },
    { code: "TUR", name: "Türkiye", pot: 3 },
    { code: "UKR", name: "Ukraine", pot: 3 },
    { code: "WAL", name: "Wales", pot: 3 },
    { code: "ECU", name: "Ecuador", pot: 3 },
    { code: "PAR", name: "Paraguay", pot: 3 },
    { code: "PER", name: "Peru", pot: 3 },
    { code: "NGA", name: "Nigeria", pot: 3 },
    { code: "GHA", name: "Ghana", pot: 3 },
    { code: "TUN", name: "Tunisia", pot: 3 },
    { code: "IRN", name: "Iran", pot: 4 },
    { code: "QAT", name: "Qatar", pot: 4 },
    { code: "SAU", name: "Saudi Arabia", pot: 4 },
    { code: "UZB", name: "Uzbekistan", pot: 4 },
    { code: "JOR", name: "Jordan", pot: 4 },
    { code: "NZL", name: "New Zealand", pot: 4 },
    { code: "CRC", name: "Costa Rica", pot: 4 },
    { code: "PAN", name: "Panama", pot: 4 },
    { code: "JAM", name: "Jamaica", pot: 4 },
    { code: "HAI", name: "Haiti", pot: 4 },
    { code: "CIV", name: "Côte d'Ivoire", pot: 4 },
    { code: "RSA", name: "South Africa", pot: 4 },
];

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

const FAKE_NAMES = [
    "Big Dave", "Sarah-Bot", "Pundit Phil", "Eddie", "Marco", "Priya",
    "Goal-Hungry Greg", "Couch Coach Cara", "Hat-Trick Hank", "Joga Jack",
    "Set-Piece Sam", "VAR Vera", "Late-Tackle Tim", "Back-Heel Bea",
];

const FAKE_GOALSCORERS = [
    "Sky O. Striker", "Boots Magee", "Hat Trick", "Net Buster",
    "Goalden Glove", "Off-Side Otis", "Far-Post Fred", "Header Helga",
];

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

async function reset(): Promise<void> {
    // FK order matters.
    await db.delete(jokers);
    await db.delete(predictions);
    await db.delete(bonusPicks);
    await db.delete(bonusResolutions);
    await db.delete(auditLog);
    // Restore tournament_kickoff to the real WC opening match so the site doesn't
    // stay locked from a previous sim run (sim setup squashes kickoff to "now").
    await db
        .update(settings)
        .set({
            tournamentKickoff: new Date("2026-06-11T20:00:00Z"),
            winnerTeamId: null,
            topScorerName: null,
        })
        .where(eq(settings.id, 1));
    // Matches first (FKs to teams), then players, then teams.
    await db.delete(matches);
    await db.delete(players);
    await db.delete(teams);
    // Reset PK sequences so seeded IDs are predictable across runs.
    await db.execute(sql`ALTER SEQUENCE teams_id_seq RESTART WITH 1`);
    await db.execute(sql`ALTER SEQUENCE matches_id_seq RESTART WITH 1`);
    await db.execute(sql`ALTER SEQUENCE players_id_seq RESTART WITH 1`);
    console.log("✓ wiped sim data (tournament_kickoff restored to 2026-06-11)");
}

// ---------------------------------------------------------------------------
// Setup: seed teams + groups + matches + players + picks
// ---------------------------------------------------------------------------

async function setup(args: Record<string, string>): Promise<void> {
    const seed = Number(args.seed ?? "1");
    const playerCount = Math.min(Number(args.players ?? "12"), FAKE_NAMES.length);
    const rng = rngFromSeed(seed);

    // Seed teams + assign groups (4 per group, A–L).
    const teamRows = SIM_TEAMS.slice(0, 48).map((t, i) => ({
        ...t,
        groupLetter: GROUPS[Math.floor(i / 4)]!,
        fifaRanking: i + 1,
    }));
    const inserted = await db
        .insert(teams)
        .values(
            teamRows.map((t) => ({
                code: t.code,
                name: t.name,
                groupLetter: t.groupLetter,
                pot: t.pot,
                fifaRanking: t.fifaRanking,
            })),
        )
        .returning();
    const teamByCode = new Map(inserted.map((t) => [t.code, t]));

    // Set tournament kickoff to one second from now so the bonuses lock immediately
    // for sim — but allow setup to run before clamping.
    const tournamentStart = new Date(Date.now() + 60_000);
    await db
        .insert(settings)
        .values({ id: 1, tournamentKickoff: tournamentStart })
        .onConflictDoUpdate({
            target: settings.id,
            set: { tournamentKickoff: tournamentStart },
        });

    // Generate group-stage matches: every pair within each group plays once.
    const matchInserts: {
        round: Round;
        groupLetter: string | null;
        kickoff: Date;
        homeTeamId: number | null;
        awayTeamId: number | null;
        matchNumber: number;
    }[] = [];
    let kickoff = tournamentStart.getTime();
    let matchN = 1;
    for (const g of GROUPS) {
        const gTeams = teamRows.filter((t) => t.groupLetter === g);
        for (let i = 0; i < gTeams.length; i++) {
            for (let j = i + 1; j < gTeams.length; j++) {
                kickoff += 30 * 60_000; // 30 min between matches
                matchInserts.push({
                    round: "GROUP",
                    groupLetter: g,
                    kickoff: new Date(kickoff),
                    homeTeamId: teamByCode.get(gTeams[i]!.code)!.id,
                    awayTeamId: teamByCode.get(gTeams[j]!.code)!.id,
                    matchNumber: matchN++,
                });
            }
        }
    }
    // Knockout matches with null teams; brackets fill in as rounds resolve.
    const koRounds: { round: Round; count: number }[] = [
        { round: "R32", count: 16 },
        { round: "R16", count: 8 },
        { round: "QF", count: 4 },
        { round: "SF", count: 2 },
        { round: "THIRD", count: 1 },
        { round: "FINAL", count: 1 },
    ];
    for (const { round, count } of koRounds) {
        for (let i = 0; i < count; i++) {
            kickoff += 60 * 60_000;
            matchInserts.push({
                round,
                groupLetter: null,
                kickoff: new Date(kickoff),
                homeTeamId: null,
                awayTeamId: null,
                matchNumber: matchN++,
            });
        }
    }
    await db.insert(matches).values(matchInserts);
    console.log(`✓ seeded 48 teams (12 groups) and ${matchInserts.length} matches`);

    // Seed players. Synthetic emails so the NOT NULL email column is happy
    // and you can spot sim accounts at a glance.
    const playerNames = shuffle(rng, FAKE_NAMES).slice(0, playerCount);
    const playerRows = await db
        .insert(players)
        .values(
            playerNames.map((n) => ({
                displayName: n,
                email: `${n.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@sim.local`,
            })),
        )
        .returning();
    console.log(`✓ created ${playerRows.length} sim players`);

    // Predictions: every player predicts every group match (they happen for sure).
    // Knockout matches get predictions too — even though the teams aren't filled yet,
    // the prediction is the scoreline players want; mapping to actual teams happens at settlement.
    const allMatches = await db.select().from(matches);
    const predictionInserts: typeof predictions.$inferInsert[] = [];
    for (const player of playerRows) {
        for (const m of allMatches) {
            // Goal distribution: 0,1,2,3,4,5 with weights 30/35/20/10/4/1
            const homeScore = weightedGoal(rng);
            const awayScore = weightedGoal(rng);
            predictionInserts.push({
                playerId: player.id,
                matchId: m.id,
                homeScore,
                awayScore,
            });
        }
    }
    await db.insert(predictions).values(predictionInserts);
    console.log(`✓ ${predictionInserts.length} random predictions filed`);

    // Bonus picks per player.
    const teamList = inserted;
    const bonusInserts: typeof bonusPicks.$inferInsert[] = [];
    for (const player of playerRows) {
        bonusInserts.push({ playerId: player.id, kind: "WINNER", teamId: pick(rng, teamList).id });
        bonusInserts.push({
            playerId: player.id,
            kind: "DARK_HORSE",
            teamId: pick(rng, teamList.filter((t) => t.pot !== 1)).id,
        });
        bonusInserts.push({ playerId: player.id, kind: "WOODEN_SPOON", teamId: pick(rng, teamList).id });
        bonusInserts.push({ playerId: player.id, kind: "PANTOMIME_VILLAIN", teamId: pick(rng, teamList).id });
        bonusInserts.push({ playerId: player.id, kind: "SIEVE", teamId: pick(rng, teamList).id });
        bonusInserts.push({
            playerId: player.id,
            kind: "MIGHTY_FALLEN",
            teamId: pick(rng, teamList.filter((t) => t.pot === 1)).id,
        });
        bonusInserts.push({
            playerId: player.id,
            kind: "TOP_SCORER",
            playerName: pick(rng, FAKE_GOALSCORERS),
        });
    }
    await db.insert(bonusPicks).values(bonusInserts);
    console.log(`✓ ${bonusInserts.length} random bonus picks filed`);

    // Random joker per knockout round (one match per round, R32/R16/QF only).
    const jokerInserts: typeof jokers.$inferInsert[] = [];
    for (const player of playerRows) {
        for (const round of ["R32", "R16", "QF"] as const) {
            const candidates = allMatches.filter((m) => m.round === round);
            const m = pick(rng, candidates);
            jokerInserts.push({ playerId: player.id, round, matchId: m.id });
        }
    }
    await db.insert(jokers).values(jokerInserts);
    console.log(`✓ ${jokerInserts.length} jokers selected`);

    console.log(`\nseed=${seed} players=${playerRows.length}\n`);
}

function weightedGoal(rng: () => number): number {
    const r = rng();
    if (r < 0.3) return 0;
    if (r < 0.65) return 1;
    if (r < 0.85) return 2;
    if (r < 0.95) return 3;
    if (r < 0.99) return 4;
    return 5;
}

// ---------------------------------------------------------------------------
// Play: settle one round at a time. Re-runnable.
// ---------------------------------------------------------------------------

const ROUND_ORDER: Round[] = ["GROUP", "R32", "R16", "QF", "SF", "THIRD", "FINAL"];

async function play(args: Record<string, string>): Promise<void> {
    const seed = Number(args.seed ?? "1");
    const upTo = (args["up-to"] ?? "FINAL").toUpperCase() as Round;
    if (!ROUND_ORDER.includes(upTo)) {
        throw new Error(`unknown --up-to value: ${upTo}`);
    }
    const rng = rngFromSeed(seed + 1000);

    for (const round of ROUND_ORDER) {
        await settleRound(round, rng);
        if (round === upTo) {
            break;
        }
        if (round === "GROUP") {
            await fillR32(rng);
        } else if (round !== "THIRD" && round !== "FINAL") {
            await advanceBracket(round);
        }
    }
}

/**
 * Settle a single match in place. Returns the resulting score so callers can
 * print a one-line summary. Throws if the match is already finished or has
 * unresolved teams.
 */
async function settleOne(
    matchId: number,
    opts: { home?: number; away?: number; rng: () => number },
): Promise<{ round: Round; home: number; away: number; homeName: string; awayName: string }> {
    const m = (await db.select().from(matches).where(eq(matches.id, matchId)).limit(1))[0];
    if (m === undefined) {
        throw new Error(`match ${matchId} not found`);
    }
    if (m.status === "FINISHED") {
        throw new Error(`match ${matchId} is already finished`);
    }
    if (m.homeTeamId === null || m.awayTeamId === null) {
        throw new Error(`match ${matchId} has unresolved teams (still TBD)`);
    }
    let h = opts.home ?? weightedGoal(opts.rng);
    let a = opts.away ?? weightedGoal(opts.rng);
    // Knockouts can't draw — if the user explicitly chose a draw we let it
    // through (they're testing something), otherwise nudge.
    if (m.round !== "GROUP" && h === a && opts.home === undefined && opts.away === undefined) {
        if (opts.rng() < 0.5) h += 1;
        else a += 1;
    }
    const winnerTeamId = h > a ? m.homeTeamId : a > h ? m.awayTeamId : null;
    await db
        .update(matches)
        .set({
            homeScore: h,
            awayScore: a,
            status: "FINISHED",
            winnerTeamId: m.round === "GROUP" ? null : winnerTeamId,
        })
        .where(eq(matches.id, m.id));

    const teamRows = await db.select().from(teams);
    const teamById = new Map(teamRows.map((t) => [t.id, t]));
    return {
        round: m.round,
        home: h,
        away: a,
        homeName: teamById.get(m.homeTeamId)?.name ?? "?",
        awayName: teamById.get(m.awayTeamId)?.name ?? "?",
    };
}

/**
 * If every match in `round` is finished, advance the bracket.
 * (After GROUP → fill R32 from standings; after each KO → fill the next round.)
 */
async function advanceIfRoundComplete(round: Round, rng: () => number): Promise<boolean> {
    const all = await db.select().from(matches).where(eq(matches.round, round));
    const settleable = all.filter((m) => m.homeTeamId !== null && m.awayTeamId !== null);
    if (settleable.length === 0) {
        return false;
    }
    const allFinished = settleable.every((m) => m.status === "FINISHED");
    if (!allFinished) {
        return false;
    }
    if (round === "GROUP") {
        await fillR32(rng);
        return true;
    }
    if (round === "R32" || round === "R16" || round === "QF" || round === "SF") {
        await advanceBracket(round);
        return true;
    }
    return false;
}

async function settleRound(round: Round, rng: () => number): Promise<void> {
    const open = await db.select().from(matches).where(eq(matches.round, round));
    let settled = 0;
    for (const m of open) {
        if (m.status === "FINISHED") {
            continue;
        }
        if (m.homeTeamId === null || m.awayTeamId === null) {
            continue;
        }
        await settleOne(m.id, { rng });
        settled += 1;
    }
    if (settled > 0) {
        console.log(`✓ ${round}: settled ${settled} matches`);
    }
}

interface Standing {
    teamId: number;
    points: number;
    gd: number;
    gs: number;
    groupLetter: string;
}

async function groupStandings(): Promise<Map<string, Standing[]>> {
    const groupMatches = await db.select().from(matches).where(eq(matches.round, "GROUP"));
    const teamRows = await db.select().from(teams);
    const teamById = new Map(teamRows.map((t) => [t.id, t]));
    const map = new Map<string, Map<number, Standing>>();
    for (const t of teamRows) {
        if (t.groupLetter === null) continue;
        if (!map.has(t.groupLetter)) map.set(t.groupLetter, new Map());
        map.get(t.groupLetter)!.set(t.id, {
            teamId: t.id,
            points: 0,
            gd: 0,
            gs: 0,
            groupLetter: t.groupLetter,
        });
    }
    for (const m of groupMatches) {
        if (m.status !== "FINISHED" || m.homeTeamId === null || m.awayTeamId === null) continue;
        const g = teamById.get(m.homeTeamId)?.groupLetter;
        if (g === null || g === undefined) continue;
        const home = map.get(g)?.get(m.homeTeamId);
        const away = map.get(g)?.get(m.awayTeamId);
        if (home === undefined || away === undefined) continue;
        const hs = m.homeScore ?? 0;
        const as = m.awayScore ?? 0;
        home.gd += hs - as;
        home.gs += hs;
        away.gd += as - hs;
        away.gs += as;
        if (hs > as) home.points += 3;
        else if (hs < as) away.points += 3;
        else {
            home.points += 1;
            away.points += 1;
        }
    }
    const out = new Map<string, Standing[]>();
    for (const [g, inner] of map) {
        const sorted = Array.from(inner.values()).sort((x, y) =>
            y.points !== x.points ? y.points - x.points : y.gd !== x.gd ? y.gd - x.gd : y.gs - x.gs,
        );
        out.set(g, sorted);
    }
    return out;
}

async function fillR32(rng: () => number): Promise<void> {
    const standings = await groupStandings();
    // Top 2 of each group + best 8 third-placed = 32 teams.
    const winners: number[] = [];
    const runnersUp: number[] = [];
    const thirds: Standing[] = [];
    for (const g of GROUPS) {
        const s = standings.get(g) ?? [];
        if (s[0] !== undefined) winners.push(s[0].teamId);
        if (s[1] !== undefined) runnersUp.push(s[1].teamId);
        if (s[2] !== undefined) thirds.push(s[2]);
    }
    const bestThirds = thirds
        .sort((a, b) => (b.points - a.points) || (b.gd - a.gd) || (b.gs - a.gs))
        .slice(0, 8)
        .map((s) => s.teamId);
    const advancing = shuffle(rng, [...winners, ...runnersUp, ...bestThirds]);
    if (advancing.length !== 32) {
        console.warn(`⚠ expected 32 advancing, got ${advancing.length}`);
    }
    const r32 = await db.select().from(matches).where(eq(matches.round, "R32"));
    for (let i = 0; i < r32.length; i++) {
        await db
            .update(matches)
            .set({
                homeTeamId: advancing[i * 2] ?? null,
                awayTeamId: advancing[i * 2 + 1] ?? null,
            })
            .where(eq(matches.id, r32[i]!.id));
    }
    console.log("✓ R32 bracket filled");
}

async function advanceBracket(fromRound: Round): Promise<void> {
    const nextRoundByPrev: Partial<Record<Round, Round>> = {
        R32: "R16",
        R16: "QF",
        QF: "SF",
        SF: "FINAL",
    };
    const next = nextRoundByPrev[fromRound];
    if (next === undefined) return;
    const finished = await db.select().from(matches).where(eq(matches.round, fromRound));
    const winners = finished
        .filter((m) => m.winnerTeamId !== null)
        .sort((a, b) => a.id - b.id)
        .map((m) => m.winnerTeamId!);
    const target = await db.select().from(matches).where(eq(matches.round, next));
    for (let i = 0; i < target.length; i++) {
        await db
            .update(matches)
            .set({
                homeTeamId: winners[i * 2] ?? null,
                awayTeamId: winners[i * 2 + 1] ?? null,
            })
            .where(eq(matches.id, target[i]!.id));
    }
    // 3rd place play-off — losing semi-finalists.
    if (fromRound === "SF") {
        const losers = finished
            .filter((m) => m.winnerTeamId !== null && m.homeTeamId !== null && m.awayTeamId !== null)
            .map((m) => (m.winnerTeamId === m.homeTeamId ? m.awayTeamId! : m.homeTeamId!));
        const third = await db.select().from(matches).where(eq(matches.round, "THIRD"));
        if (third[0] !== undefined) {
            await db
                .update(matches)
                .set({ homeTeamId: losers[0] ?? null, awayTeamId: losers[1] ?? null })
                .where(eq(matches.id, third[0].id));
        }
    }
    console.log(`✓ ${next} bracket filled (and 3rd-place if SF)`);
}

// ---------------------------------------------------------------------------
// Resolve: derive winner, top scorer, sieve, etc. from actual outcomes.
// ---------------------------------------------------------------------------

async function resolve(): Promise<void> {
    const allMatches = await db.select().from(matches);
    const allTeams = await db.select().from(teams);
    const teamById = new Map(allTeams.map((t) => [t.id, t]));

    const final = allMatches.find((m) => m.round === "FINAL");
    const winnerTeamId = final?.winnerTeamId;

    // Goals conceded per team (Sieve).
    const conceded = new Map<number, number>();
    const groupOnly = allMatches.filter((m) => m.round === "GROUP" && m.status === "FINISHED");
    for (const m of allMatches) {
        if (m.status !== "FINISHED" || m.homeTeamId === null || m.awayTeamId === null) continue;
        conceded.set(m.homeTeamId, (conceded.get(m.homeTeamId) ?? 0) + (m.awayScore ?? 0));
        conceded.set(m.awayTeamId, (conceded.get(m.awayTeamId) ?? 0) + (m.homeScore ?? 0));
    }
    const sieve = pickHighest(conceded);

    // Wooden spoon: bottom of group standings, fewest points → worst GD → fewest GS.
    const standings = await groupStandings();
    let worst: Standing | undefined = undefined;
    for (const arr of standings.values()) {
        const last = arr[arr.length - 1];
        if (last === undefined) continue;
        if (
            worst === undefined ||
            last.points < worst.points ||
            (last.points === worst.points && last.gd < worst.gd) ||
            (last.points === worst.points && last.gd === worst.gd && last.gs < worst.gs)
        ) {
            worst = last;
        }
    }

    // Mighty Fallen: Pot-1 teams that didn't make it past groups (no R32 appearance).
    const advancingIds = new Set<number>();
    for (const m of allMatches) {
        if (m.round === "R32" && m.homeTeamId !== null) advancingIds.add(m.homeTeamId);
        if (m.round === "R32" && m.awayTeamId !== null) advancingIds.add(m.awayTeamId);
    }
    const mightyFallen = allTeams
        .filter((t) => t.pot === 1 && !advancingIds.has(t.id))
        .map((t) => t.id);

    // We have no real cards data — pick the most-fouled-looking team randomly from
    // the highest-scoring matches as a stand-in. Better than nothing for sim.
    const cardsCount = new Map<number, number>();
    for (const m of groupOnly) {
        if (m.homeTeamId === null || m.awayTeamId === null) continue;
        const intensity = (m.homeScore ?? 0) + (m.awayScore ?? 0);
        cardsCount.set(m.homeTeamId, (cardsCount.get(m.homeTeamId) ?? 0) + intensity);
        cardsCount.set(m.awayTeamId, (cardsCount.get(m.awayTeamId) ?? 0) + intensity);
    }
    const pantomime = pickHighest(cardsCount);

    // Top scorer isn't tracked in sim — just pick a fake name.
    const topScorerName = "Sky O. Striker";

    const upserts: { kind: any; groupLetter: string; teamIds: number[]; playerNames: string[] }[] = [
        { kind: "WINNER", groupLetter: "", teamIds: winnerTeamId !== null && winnerTeamId !== undefined ? [winnerTeamId] : [], playerNames: [] },
        { kind: "TOP_SCORER", groupLetter: "", teamIds: [], playerNames: [topScorerName] },
        { kind: "WOODEN_SPOON", groupLetter: "", teamIds: worst !== undefined ? [worst.teamId] : [], playerNames: [] },
        { kind: "PANTOMIME_VILLAIN", groupLetter: "", teamIds: pantomime, playerNames: [] },
        { kind: "SIEVE", groupLetter: "", teamIds: sieve, playerNames: [] },
        { kind: "MIGHTY_FALLEN", groupLetter: "", teamIds: mightyFallen, playerNames: [] },
    ];

    for (const u of upserts) {
        await db
            .insert(bonusResolutions)
            .values(u)
            .onConflictDoUpdate({
                target: [bonusResolutions.kind, bonusResolutions.groupLetter],
                set: { teamIds: u.teamIds, playerNames: u.playerNames, updatedAt: new Date() },
            });
    }

    console.log("✓ resolved bonuses:");
    console.log(`   winner          : ${winnerTeamId !== null && winnerTeamId !== undefined ? teamById.get(winnerTeamId)?.name : "(none)"}`);
    console.log(`   wooden spoon    : ${worst !== undefined ? teamById.get(worst.teamId)?.name : "(none)"}`);
    console.log(`   sieve           : ${sieve.map((id) => teamById.get(id)?.name).join(", ") || "(none)"}`);
    console.log(`   pantomime       : ${pantomime.map((id) => teamById.get(id)?.name).join(", ") || "(none)"}`);
    console.log(`   mighty fallen   : ${mightyFallen.map((id) => teamById.get(id)?.name).join(", ") || "(none)"}`);
    console.log(`   top scorer      : ${topScorerName}`);
}

function pickHighest(map: Map<number, number>): number[] {
    let max = -Infinity;
    for (const v of map.values()) {
        if (v > max) max = v;
    }
    if (max === -Infinity) return [];
    return Array.from(map.entries())
        .filter(([, v]) => v === max)
        .map(([k]) => k);
}

// ---------------------------------------------------------------------------
// Leaderboard (CLI print)
// ---------------------------------------------------------------------------

async function printLeaderboard(): Promise<void> {
    const [allPlayers, allMatches, allPredictions, allJokers, allBonusPicks, allResolutions] =
        await Promise.all([
            db.select().from(players),
            db.select().from(matches),
            db.select().from(predictions),
            db.select().from(jokers),
            db.select().from(bonusPicks),
            db.select().from(bonusResolutions),
        ]);

    const bonusPointsByPlayer = computeBonusPointsByPlayer({
        picks: allBonusPicks.map((b) => ({
            playerId: b.playerId,
            kind: b.kind,
            groupLetter: b.groupLetter,
            teamId: b.teamId,
            playerName: b.playerName,
        })),
        resolutions: allResolutions.map((r) => ({
            kind: r.kind,
            groupLetter: r.groupLetter,
            teamIds: r.teamIds,
            playerNames: r.playerNames,
        })),
        matches: allMatches.map((m) => ({
            round: m.round,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
        })),
    });

    const rows = buildLeaderboard({
        players: allPlayers.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            joinedAt: p.joinedAt,
        })),
        matches: allMatches.map((m) => ({
            id: m.id,
            round: m.round,
            status: m.status,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            winnerTeamId: m.winnerTeamId,
        })),
        predictions: allPredictions.map((p) => ({
            playerId: p.playerId,
            matchId: p.matchId,
            homeScore: p.homeScore,
            awayScore: p.awayScore,
        })),
        jokers: allJokers.map((j) => ({
            playerId: j.playerId,
            round: j.round,
            matchId: j.matchId,
        })),
        bonusPointsByPlayer,
    });

    console.log("\n  #   Player                      Pts   Pred   Bonus  Exact  KO");
    console.log("  ─────────────────────────────────────────────────────────────");
    rows.forEach((r, i) => {
        const pred = r.points - r.bonusPoints;
        const crown = i === 0 ? "👑 " : "   ";
        console.log(
            `  ${String(i + 1).padStart(2)}  ${crown}${r.displayName.padEnd(22)}${String(r.points).padStart(5)}  ${String(pred).padStart(5)}  ${String(r.bonusPoints).padStart(5)}  ${String(r.exactCount).padStart(5)}  ${String(r.knockoutResults).padStart(3)}`,
        );
    });
    console.log("");
    console.log(
        `  scoring max possible (perfect predictions + all bonuses, no joker): ${theoreticalCeiling()}\n`,
    );
}

function theoreticalCeiling(): number {
    // 72 group × 4 + 32 KO × 6 + sum bonuses (excluding joker which isn't strictly added).
    const predMax = 72 * 4 + 32 * 6;
    const bonusMax =
        BONUS_POINTS.WINNER +
        BONUS_POINTS.TOP_SCORER +
        BONUS_POINTS.WOODEN_SPOON +
        BONUS_POINTS.PANTOMIME_VILLAIN +
        BONUS_POINTS.SIEVE +
        BONUS_POINTS.MIGHTY_FALLEN +
        57; // dark horse top
    return predMax + bonusMax;
}

// ---------------------------------------------------------------------------
// Run = reset + setup + play full + resolve + leaderboard
// ---------------------------------------------------------------------------

async function run(args: Record<string, string>): Promise<void> {
    await reset();
    await setup(args);
    await play({ ...args, "up-to": "FINAL" });
    await resolve();
    await printLeaderboard();
}

// ---------------------------------------------------------------------------
// One-match-at-a-time playback
// ---------------------------------------------------------------------------

async function playNext(args: Record<string, string>): Promise<void> {
    const seed = Number(args.seed ?? "1");
    const rng = rngFromSeed(seed + Date.now());
    const next = (
        await db
            .select()
            .from(matches)
            .where(eq(matches.status, "SCHEDULED"))
            .orderBy(asc(matches.kickoff))
    ).find((m) => m.homeTeamId !== null && m.awayTeamId !== null);
    if (next === undefined) {
        console.log(
            "No scheduled match has both teams set. Check the bracket — you may need `pnpm sim play --up-to=...` to fill placeholders.",
        );
        return;
    }
    const out = await settleOne(next.id, { rng });
    console.log(
        `✓ ${out.round}: ${out.homeName} ${out.home}–${out.away} ${out.awayName} (match #${next.id})`,
    );
    if (await advanceIfRoundComplete(next.round, rng)) {
        console.log(`✓ ${next.round} complete — bracket advanced`);
    }
}

async function playMatch(args: Record<string, string>): Promise<void> {
    const id = Number(args.id);
    if (!Number.isFinite(id)) {
        throw new Error("--id=<matchId> required (look it up via psql or /admin/matches)");
    }
    const home = args.home !== undefined ? Number(args.home) : undefined;
    const away = args.away !== undefined ? Number(args.away) : undefined;
    if (home !== undefined && (!Number.isInteger(home) || home < 0 || home > 20)) {
        throw new Error("--home must be an integer 0-20");
    }
    if (away !== undefined && (!Number.isInteger(away) || away < 0 || away > 20)) {
        throw new Error("--away must be an integer 0-20");
    }
    const seed = Number(args.seed ?? "1");
    const rng = rngFromSeed(seed + id);
    const out = await settleOne(id, { home, away, rng });
    console.log(
        `✓ ${out.round}: ${out.homeName} ${out.home}–${out.away} ${out.awayName} (match #${id})`,
    );
    const matchRow = (await db.select().from(matches).where(eq(matches.id, id)).limit(1))[0];
    if (matchRow !== undefined) {
        if (await advanceIfRoundComplete(matchRow.round, rng)) {
            console.log(`✓ ${matchRow.round} complete — bracket advanced`);
        }
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    const cmd = process.argv[2];
    const args = parseArgs(process.argv.slice(3));
    switch (cmd) {
        case "reset":
            await reset();
            break;
        case "setup":
            await setup(args);
            break;
        case "play":
            await play(args);
            break;
        case "play-next":
            await playNext(args);
            break;
        case "play-match":
            await playMatch(args);
            break;
        case "resolve":
            await resolve();
            break;
        case "leaderboard":
            await printLeaderboard();
            break;
        case "run":
            await run(args);
            break;
        default:
            console.log(
                "Usage: pnpm sim <reset|setup|play|play-next|play-match|resolve|leaderboard|run> [--seed=N] [--players=12] [--up-to=GROUP|R32|R16|QF|SF|FINAL] [--id=<matchId>] [--home=N] [--away=N]",
            );
            process.exit(1);
    }
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
