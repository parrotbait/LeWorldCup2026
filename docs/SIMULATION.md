# Tournament Simulation

Drive a full FIFA World Cup 2026 pick'em locally — synthetic teams, fake players, randomized predictions, generated bracket, resolved bonuses, final leaderboard. Use it to verify the system works end-to-end before the real tournament starts, or any time you change scoring logic and want to see the effect.

The simulator is **deterministic** — given a seed, the same scenario plays out every time.

> ⚠️ **The simulator wipes your local DB.** Don't run it against production. The script targets whatever `POSTGRES_URL` resolves to in `.env.local`.

## Prerequisites

- Local Postgres running (`brew services start postgresql@16` if you're not sure)
- Migrations applied (`pnpm db:migrate`)
- The app installed (`pnpm install`)

## One-shot end-to-end

```sh
pnpm sim run --seed=42 --players=12
```

That single command:

1. Wipes all sim data (matches, players, predictions, bonuses, jokers, audit log).
2. Seeds 48 teams across 12 groups (A–L) with synthetic pots.
3. Creates 12 fake players with whimsical names.
4. Files randomized predictions for every match (104 of them).
5. Files randomized bonus picks (winner / dark horse / wooden spoon / golden boot / first scorer / pantomime villain / sieve / mighty fallen / 12 group winners) for each player.
6. Picks one joker per knockout round per player.
7. Settles every match round-by-round with weighted-random scores (no draws in knockouts).
8. Fills the bracket as each round ends, including third-place play-off.
9. Resolves the bonus values from the actual outcomes (winner, sieve = team conceding most, mighty fallen = Pot-1 teams that didn't make R32, etc.).
10. Prints the final leaderboard to stdout.

Open the live site (`pnpm dev`) afterwards to see the same data in the UI: leaderboard, /me, /matches, /admin/bonuses.

## Subcommands

For step-by-step exploration:

| Command | Effect |
|---|---|
| `pnpm sim reset` | Wipe all sim data (teams, matches, players, predictions, bonuses, jokers, audit log). |
| `pnpm sim setup --seed=N --players=12` | Seed teams, groups, fixtures, players, picks. |
| `pnpm sim play --up-to=GROUP\|R32\|R16\|QF\|SF\|FINAL` | Settle through the named round (defaults to FINAL). Re-runnable — picks up where it left off. |
| `pnpm sim play-next [--seed=N]` | Settle just the next-by-kickoff scheduled match with both teams set. Auto-advances the bracket if that match was the last in its round. |
| `pnpm sim play-match --id=N [--home=X --away=Y] [--seed=N]` | Settle a specific match. With `--home`/`--away` you choose the score (handy for testing exact-pick scoring). Without, scores are random. Auto-advances the bracket if applicable. |
| `pnpm sim resolve` | Set bonus resolutions from actual outcomes. Run this once the tournament has finished. |
| `pnpm sim leaderboard` | Print the current standings to stdout. |
| `pnpm sim run --seed=N --players=12` | Reset + setup + play + resolve + leaderboard, in one go. |

Need a match id for `play-match`? Look in `/admin/matches`, or:

```sh
psql -d leworldcup -c "select id, round, home_team_id, away_team_id, status from matches where status='SCHEDULED' order by kickoff limit 10"
```

## Common workflows

### Quick smoke test of the whole loop

```sh
pnpm sim run --seed=1
```

### Stop after groups, log into the site, then advance

```sh
pnpm sim reset
pnpm sim setup --seed=7
pnpm sim play --up-to=GROUP
pnpm dev               # browse /leaderboard, /matches, /me with group results in
# back to terminal:
pnpm sim play --up-to=R16
pnpm sim play          # finishes the rest
pnpm sim resolve
pnpm sim leaderboard
```

### Try the same scenario with different player counts

```sh
pnpm sim run --seed=10 --players=4
pnpm sim run --seed=10 --players=12
```

Same matches and outcomes (matches depend on seed, not player count), different ranks.

### Replay yesterday's chaos with a fix

After changing scoring logic in `lib/scoring.ts`:

```sh
pnpm sim leaderboard   # before
# … edit code …
pnpm sim leaderboard   # after — see the new totals against the same matches+picks
```

## How the sim differs from a real tournament

- **No real teams or fixture data.** The 48 teams in `scripts/sim.ts` are plausible WC contenders with made-up pots; the bracket pairs adjacent qualifiers rather than following FIFA's actual draw rules.
- **No player goalscorers.** Top Scorer and First Goal Scorer are resolved to fixed fake names (`Sky O. Striker`, `Boots Magee`). Anyone who picked those wins; everyone else doesn't.
- **No cards data.** Pantomime Villain is approximated by treating the highest-scoring matches as the "most chaotic" — close enough for testing the scoring path.
- **Knockout matches never go to penalties.** If the random scores tie, the sim nudges one team up by a goal so there's always a winner.
- **Kickoff times are squashed.** All 104 matches are scheduled 30–60 minutes apart starting just after `now`. Don't expect realistic dates.

For the real tournament, fixtures and scores come from `football-data.org` via `pnpm db:seed` plus the cron route. The simulator and the real path live alongside each other — the sim doesn't touch the football-data code.

## Resetting the production-like state

After playing with the sim, restore a clean baseline with the real data:

```sh
pnpm sim reset
pnpm db:seed                # re-creates the settings row (kickoff = 11 Jun 2026)
pnpm restore                # re-loads teams + matches from data/wc2026-snapshot.json
```

`pnpm sim reset` automatically restores `tournament_kickoff` to 11 Jun 2026 so the site doesn't stay locked from a previous sim run (sim setup squashes the kickoff to "now" so bonuses lock immediately during play).

If you'd rather pull live data from football-data.org instead of the snapshot, swap the `pnpm restore` for the cron sync curl from the README.

## Snapshotting + restoring fixture data

`pnpm snapshot` writes the current teams + matches to `data/wc2026-snapshot.json` (versioned in git). `pnpm restore` reads that file back. Use this so we don't depend on football-data.org being reachable when we want to reset:

```sh
# After a healthy cron sync, capture
pnpm snapshot                                # → data/wc2026-snapshot.json
pnpm snapshot --out=data/2026-06-08.json     # custom path

# Later, restore
pnpm restore                                 # reads data/wc2026-snapshot.json
pnpm restore --in=data/2026-06-08.json       # custom path
```

Restore upserts on team `code` and match `externalId`, so it's idempotent and safe to re-run. Predictions, bonus picks, and jokers are not touched.

## Troubleshooting

**`relation "teams" does not exist`** — migrations haven't been applied. Run `pnpm db:migrate`.

**Postgres can't connect** — check `brew services list` shows `postgresql@16` as `started`. The simulator reads `POSTGRES_URL` from `.env.local`.

**`pnpm sim play` does nothing** — every round is already settled. Use `pnpm sim reset` first.

**Strange numbers** — re-run with the same seed to confirm reproducibility, then dig into `lib/scoring.ts` if the totals don't add up. The scoring engine is pure and unit-tested (`lib/scoring.test.ts`).
