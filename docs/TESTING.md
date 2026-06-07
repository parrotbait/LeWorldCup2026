# Local Testing Recipes

Practical, copy-paste recipes for poking at the app on your laptop. Pair these with `pnpm dev` running on `http://localhost:3000` and a Postgres instance on `localhost:5432`.

> All recipes assume `POSTGRES_URL` is set in your shell or `.env.local`. To use it inline, prefix commands with `POSTGRES_URL="postgres://eddielong@localhost:5432/leworldcup"`.

---

## 0. First-time setup

```sh
brew services start postgresql@16
createdb leworldcup
pnpm install
pnpm db:migrate
pnpm db:seed              # settings row + canonical kickoff
pnpm restore              # teams + matches from data/wc2026-snapshot.json
pnpm sim setup --players=2   # OR seed yourself directly via /signup
pnpm dev
```

When you're stuck in a weird state, the canonical reset is always:

```sh
pnpm sim reset
pnpm db:seed
pnpm restore
```

---

## 1. Run the unit tests

The scoring engine is pure and unit-tested:

```sh
pnpm test                 # one-shot
pnpm test:watch           # rerun on save
```

Add new cases in `lib/scoring.test.ts`. Anything you change in `lib/scoring.ts` should come with a test.

---

## 2. End-to-end simulator (the big one)

Replays an entire World Cup with synthetic teams + fake players. Use it as a smoke test after any scoring change.

```sh
pnpm sim run --seed=42 --players=12
```

That single command resets, seeds, plays every round, resolves bonuses, and prints the final leaderboard. Then `pnpm dev` and browse `/leaderboard`, `/me`, `/players/1`, `/admin/bonuses` to see the same data through the UI.

For step-by-step exploration:

| Command | Effect |
|---|---|
| `pnpm sim reset` | Wipe sim data (teams, matches, players, picks, jokers, audit log) |
| `pnpm sim setup --seed=N --players=12` | Seed teams, fixtures, players, randomized picks |
| `pnpm sim play --up-to=GROUP\|R32\|R16\|QF\|SF\|FINAL` | Settle through the named round (defaults to FINAL) |
| `pnpm sim play-next` | Settle just the next-by-kickoff scheduled match |
| `pnpm sim play-match --id=N --home=2 --away=1` | Settle a specific match with a chosen score |
| `pnpm sim resolve` | Set bonus resolutions from actual outcomes |
| `pnpm sim leaderboard` | Print standings |

Caveat: the sim never sends knockouts to penalties — if the random scores tie, it nudges one side up. To test pens, see §6 below.

Full reference: `docs/SIMULATION.md`.

---

## 3. Test the `/predictions` page (lock countdown, settled rows, points display)

Find a few fixture ids:

```sh
psql "$POSTGRES_URL" -c "SELECT id, round, kickoff, status FROM matches ORDER BY kickoff LIMIT 5;"
```

### Recipe — kicks off in 5 minutes (test the lock countdown)

Predictions lock 15 min before kickoff (`PICK_LOCK_BUFFER_MS` in `lib/utils.ts`). With kickoff 5 min away, the row should already be locked.

```sh
psql "$POSTGRES_URL" -c "UPDATE matches SET kickoff = NOW() + INTERVAL '5 minutes', status = 'SCHEDULED' WHERE id = 19;"
```

### Recipe — kicks off in 30 minutes (still editable)

```sh
psql "$POSTGRES_URL" -c "UPDATE matches SET kickoff = NOW() + INTERVAL '30 minutes', status = 'SCHEDULED' WHERE id = 19;"
```

Reload `/predictions` — countdown should read `locks in 15m`. At T-15 it flips to `locked 🔒`.

### Recipe — settled match (test the points-earned display)

```sh
psql "$POSTGRES_URL" -c "UPDATE matches SET kickoff = NOW() - INTERVAL '2 hours', status = 'FINISHED', home_score = 2, away_score = 1 WHERE id = 19;"
psql "$POSTGRES_URL" -c "INSERT INTO predictions (player_id, match_id, home_score, away_score) VALUES (1, 19, 2, 1) ON CONFLICT (player_id, match_id) DO UPDATE SET home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score;"
```

Reload — row should show `full time 2–1 · +4 exact` (group) or `+6 exact` (knockout).

### Recipe — server-side lock check

To prove the server enforces the 15-min buffer regardless of UI state, open devtools → Application → Storage and grab your session cookie, then directly call the server action via a kicked-off match:

```sh
# Set match to kicked off
psql "$POSTGRES_URL" -c "UPDATE matches SET kickoff = NOW() - INTERVAL '1 minute', status = 'LIVE' WHERE id = 19;"
```

Submit a pick via the UI → server returns `Picks for this match are locked`.

---

## 4. Test the `/today` page

`/today` shows fixtures in a ±24h window plus anything `LIVE`. Picks reveal at T-15.

### Recipe — full today slate

```sh
psql "$POSTGRES_URL" <<'SQL'
-- Just finished
UPDATE matches SET kickoff = NOW() - INTERVAL '4 hours', status = 'FINISHED', home_score = 3, away_score = 2 WHERE id = 19;
-- Live now
UPDATE matches SET kickoff = NOW() - INTERVAL '30 minutes', status = 'LIVE', home_score = 1, away_score = 1 WHERE id = 20;
-- Kicks off in 3 hours (picks should be HIDDEN — reveals at T-15)
UPDATE matches SET kickoff = NOW() + INTERVAL '3 hours', status = 'SCHEDULED' WHERE id = 21;
-- Picks for the live + finished matches
INSERT INTO predictions (player_id, match_id, home_score, away_score) VALUES
  (1, 19, 3, 2),  -- exact
  (1, 20, 1, 0),  -- guess on the live one
  (1, 21, 2, 1)   -- hidden until T-15
ON CONFLICT (player_id, match_id) DO UPDATE SET home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score;
SQL
```

Reload `/today`. You should see:
- Match 19: full time 3–2, picks revealed, points shown.
- Match 20: live with red `● live` badge, picks revealed.
- Match 21: scheduled, picks **hidden** with "Picks reveal 15 min before kickoff".

### Recipe — flip the reveal live

```sh
psql "$POSTGRES_URL" -c "UPDATE matches SET kickoff = NOW() + INTERVAL '14 minutes' WHERE id = 21;"
```

Reload — picks now visible.

---

## 5. Test knockouts (R32 → R16 → QF → SF → THIRD → FINAL)

### How the bracket is modelled

All 104 matches exist in the `matches` table from day one — including knockout rows. Knockouts start with `home_team_id` and `away_team_id` set to NULL. As rounds resolve, those slots fill in:

| Round | Source of teams |
|---|---|
| GROUP | Pre-seeded with both teams set |
| R32 | Top 2 of each group + best 8 third-placed teams (16 fixtures × 2 teams = 32) |
| R16 | Winners of R32 |
| QF | Winners of R16 |
| SF | Winners of QF |
| THIRD | Losers of SF |
| FINAL | Winners of SF |

The only piece of code that ever fills a knockout slot is in two places:

- **Locally / simulator:** `scripts/sim.ts` — `fillR32()` (after groups complete) and `advanceBracket(fromRound)` (after each subsequent KO round). SF→FINAL also populates the THIRD-place play-off from the SF losers.
- **Live / production:** the cron route. `football-data.org` publishes the WC schedule with placeholder team objects (no TLA) for not-yet-known slots; once teams are known, FD updates the match record with real TLAs and our cron's `onConflictDoUpdate` lifts those into our `home_team_id` / `away_team_id` columns. We never compute the bracket ourselves in production — we just reflect what FD publishes.

Both paths end up with the same shape: a knockout match row whose home/away IDs go from NULL to populated as the tournament progresses.

### Recipe — full simulated tournament, end-to-end

```sh
pnpm sim run --seed=42 --players=12
```

Resets, seeds 48 teams, files randomized predictions for every player, plays groups → R32 → R16 → QF → SF → THIRD → FINAL, resolves bonuses, prints the leaderboard. Single command end-to-end smoke test.

### Recipe — round-by-round (best for inspecting between stages)

```sh
pnpm sim reset
pnpm sim setup --seed=7 --players=12
pnpm sim play --up-to=GROUP    # play ONLY the group stage
pnpm dev                       # browse /predictions, /leaderboard with groups settled
```

Then advance one round at a time and reload the UI between each:

```sh
pnpm sim play --up-to=R32     # 32 R32 fixtures filled + played
pnpm sim play --up-to=R16     # R16 brackets filled + played
pnpm sim play --up-to=QF
pnpm sim play --up-to=SF
pnpm sim play --up-to=FINAL   # plays THIRD then FINAL
```

After each, you can:
- `pnpm sim leaderboard` — see standings with knockout result/exact bonuses applied.
- `psql "$POSTGRES_URL" -c "SELECT round, status, home_team_id, away_team_id FROM matches WHERE round != 'GROUP' ORDER BY kickoff;"` — confirm bracket slots are filling correctly.

### Recipe — force a specific knockout outcome

Two ways: through the simulator, or directly via psql.

**Via simulator (auto-advances the bracket if the match is the last in its round):**
```sh
psql "$POSTGRES_URL" -c "SELECT id, round, home_team_id, away_team_id FROM matches WHERE round IN ('R32','R16','QF','SF','THIRD','FINAL') AND status='SCHEDULED' AND home_team_id IS NOT NULL ORDER BY kickoff LIMIT 5;"
pnpm sim play-match --id=<that_id> --home=2 --away=0
```

**Via psql (precise control over AET / pens / winnerTeamId):**
```sh
psql "$POSTGRES_URL" -c "UPDATE matches SET status='FINISHED', home_score=2, away_score=0, home_score_ft=2, away_score_ft=0, winner_team_id=home_team_id WHERE id = <match_id>;"
```

**Auto-advance the next round** after manually editing scores:
```sh
pnpm sim play-next   # detects the round is complete, fills the next round's bracket
```

### Recipe — only test the THIRD-place play-off

The third-place fixture is unique: home/away come from the LOSERS of the SFs, not the winners. To test:
```sh
pnpm sim reset
pnpm sim setup --seed=42
pnpm sim play --up-to=SF       # play through SF — fills THIRD automatically
psql "$POSTGRES_URL" -c "SELECT id, home_team_id, away_team_id FROM matches WHERE round='THIRD';"
# Now play it with a chosen score:
pnpm sim play-match --id=<that_id> --home=3 --away=2
```

### Recipe — only test the FINAL

```sh
pnpm sim reset
pnpm sim setup --seed=42
pnpm sim play --up-to=SF
psql "$POSTGRES_URL" -c "SELECT id, home_team_id, away_team_id FROM matches WHERE round='FINAL';"
pnpm sim play-match --id=<final_id> --home=1 --away=0
pnpm sim resolve              # recompute bonuses (winner is now known)
pnpm sim leaderboard
```

### Verify dark-horse staging through the rounds

The dark-horse bonus pays cumulatively as a team survives each round (`OUT_IN_GROUPS=0`, `INTO_R32=2`, `INTO_R16=6`, `INTO_QF=12`, `INTO_SF=22`, `INTO_FINAL=37`, `WON=57`). After running `pnpm sim play --up-to=<round>`, the bonus value for any team's dark-horse pick is derived by `deriveDarkHorseStage` (in `lib/scoring.ts`) from the matches that team appears in. There's a unit test asserting each tier in `lib/scoring.test.ts` under `describe("deriveDarkHorseStage")`; for end-to-end validation, run the simulator and inspect a player's `/me` page after each round.

### Verifying live bracket integration with football-data.org

The simulator does NOT exercise football-data — it computes the bracket itself. To verify our cron correctly absorbs FD's bracket updates:

1. **Confirm initial fixture fetch returns all 104 matches:**
   ```sh
   curl -s -H "X-Auth-Token: $FOOTBALL_DATA_TOKEN" \
     https://api.football-data.org/v4/competitions/WC/matches \
     | jq '.matches | length'
   ```
   Should return 104. If it returns less, FD hasn't published all matches yet (you'll see this before WC2026 fixtures are finalized — FD typically populates before the draw).

2. **Inspect a knockout fixture before the bracket fills:**
   ```sh
   curl -s -H "X-Auth-Token: $FOOTBALL_DATA_TOKEN" \
     https://api.football-data.org/v4/competitions/WC/matches \
     | jq '.matches[] | select(.stage == "ROUND_OF_16") | {homeTeam, awayTeam, status, score}' \
     | head -30
   ```
   Pre-bracket-fill, expect `homeTeam.tla` / `awayTeam.tla` to be `null` and team names like `"Winner Group A"`. Our cron's `if (t.tla === null) continue;` skips these — `home_team_id` / `away_team_id` stay NULL until FD publishes real TLAs.

3. **Force a local sync against the real FD endpoint** (your `.env.local` must have `FOOTBALL_DATA_TOKEN`):
   ```sh
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-results
   psql "$POSTGRES_URL" -c "SELECT round, COUNT(*) total, COUNT(home_team_id) home_set FROM matches GROUP BY round ORDER BY 1;"
   ```
   In current "pre-tournament" data you should see GROUP=72/72 set and knockouts 0 set (placeholder rows). The day after groups conclude, R32 will start showing `home_set=32`.

4. **Test that AET-final / pens fields flow through:** for any FD-finished match, check the cron's output:
   ```sh
   psql "$POSTGRES_URL" -c "SELECT id, status, home_score, away_score, home_score_ft, away_score_ft, home_score_pens, away_score_pens, winner_team_id FROM matches WHERE status='FINISHED' AND round != 'GROUP' LIMIT 5;"
   ```
   For pens-decided matches the pens columns will be non-null; AET-only finishes will have `home_score_ft != home_score`. See §6 for AET/pens scoring detail.

### Caveats vs. real tournament

- **Sim never goes to penalties.** When a knockout's random scores tie, the sim nudges one side up by a goal so there's always a clear winner. To test the AET/pens scoring path locally, set scores manually via psql (see §6).
- **Sim kickoffs are squashed.** All 104 matches are scheduled 30–60 min apart starting from "now". Don't expect realistic timestamps.
- **Sim teams are synthetic.** 48 plausible WC contenders with made-up pots. Real seeding will differ.
- **Sim doesn't contact football-data.** The bracket fills locally via `fillR32` / `advanceBracket`. If you change the live cron's logic, the simulator won't catch regressions in cron-only code paths.

---

## 6. Test extra-time + penalty-shootout scoring

The scoring rule (per `/rules` and `docs/game-design.md`):

- The canonical "score" is the scoreboard at the end of regulation + any extra time. **Penalty shootouts are display-only** — they don't change anyone's points.
- A knockout decided on pens is a draw for scoring purposes. Anyone who predicted that exact AET-final scoreline gets the exact bonus; any other draw scoreline gets the result bonus; home-win or away-win predictions get 0.

The DB models this with three score pairs on each match row:
- `home_score` / `away_score` — the AET-inclusive score used for scoring.
- `home_score_ft` / `away_score_ft` — the 90-min score (display only).
- `home_score_pens` / `away_score_pens` — the shootout score (display only).

### Recipe — knockout that went to AET and pens

```sh
# Pick a scheduled knockout
psql "$POSTGRES_URL" -c "SELECT id, round, home_team_id, away_team_id FROM matches WHERE round IN ('R32','R16','QF','SF','FINAL') AND status='SCHEDULED' ORDER BY kickoff LIMIT 1;"
```

Set 1–1 at FT, 2–2 after AET, pens 4–3 to home:

```sh
psql "$POSTGRES_URL" <<'SQL'
UPDATE matches SET
  status = 'FINISHED',
  home_score_ft = 1,  away_score_ft = 1,
  home_score    = 2,  away_score    = 2,   -- AET-final, used for scoring
  home_score_pens = 4, away_score_pens = 3,
  winner_team_id = home_team_id            -- for dark-horse staging only
WHERE id = <match_id>;
SQL
```

Add picks to inspect each branch:

```sh
psql "$POSTGRES_URL" <<'SQL'
INSERT INTO predictions (player_id, match_id, home_score, away_score) VALUES
  (1, <match_id>, 2, 2),  -- exact AET     → +6
  (2, <match_id>, 0, 0),  -- correct draw  → +3 result
  (3, <match_id>, 1, 1),  -- 90-min "exact" → +3 (still a draw, but wrong score)
  (4, <match_id>, 2, 1),  -- picked home   → 0  (it was a draw at end of AET)
  (5, <match_id>, 1, 2)   -- picked away   → 0
ON CONFLICT (player_id, match_id) DO UPDATE SET home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score;
SQL
```

Browse `/matches/<match_id>` — you should see "1–1 FT, 2–2 AET · pens 4–3" decoration under the headline score, and each player's row with the right point value.

### Recipe — knockout that ended in regulation (no ET, no pens)

```sh
psql "$POSTGRES_URL" -c "UPDATE matches SET status='FINISHED', home_score=2, away_score=1, home_score_ft=2, away_score_ft=1, home_score_pens=NULL, away_score_pens=NULL, winner_team_id=home_team_id WHERE id = <match_id>;"
```

The `/matches/<id>` page should show no AET/pens decoration — those columns are null, so the UI hides them.

### Sanity check from the unit tests

The same logic is unit-tested:

```sh
pnpm test -- -t "AET"
```

---

## 7. Test the cron sync route

The cron pulls fixtures + scores from football-data.org. To exercise locally:

```sh
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-results
```

You should get a JSON response with `{ teamCount, matchCount, errors }`. Without the bearer header you should get `401`.

The cron writes an entry to `audit_log` every run. Verify:

```sh
psql "$POSTGRES_URL" -c "SELECT created_at, action, detail FROM audit_log ORDER BY id DESC LIMIT 5;"
```

---

## 8. Test bonus picking + lock

`/bonuses` lets you file: tournament winner, top scorer, dark horse, wooden spoon, pantomime villain, sieve, mighty fallen. They lock at the first match's kickoff.

### Recipe — bonuses unlocked (default)

Make sure no match has kicked off yet:

```sh
psql "$POSTGRES_URL" -c "UPDATE matches SET kickoff = NOW() + INTERVAL '7 days' WHERE id = (SELECT id FROM matches ORDER BY kickoff LIMIT 1);"
```

Visit `/bonuses` — every section should be editable.

### Recipe — bonuses locked

```sh
psql "$POSTGRES_URL" -c "UPDATE matches SET kickoff = NOW() - INTERVAL '1 minute', status = 'LIVE' WHERE id = (SELECT id FROM matches ORDER BY kickoff LIMIT 1);"
```

Visit `/bonuses` — should be read-only.

### Reset

```sh
pnpm restore   # canonical kickoff times back
```

---

## 9. Test joker selection

You get one ×2 joker per knockout round (R32 / R16 / QF). Round locks at that round's first kickoff. Visit `/predictions` and look for the joker badge per knockout match (UI is currently hidden in v1 per `docs/game-design.md`; toggle locally if you want to test the underlying flow via `psql`):

```sh
psql "$POSTGRES_URL" -c "INSERT INTO jokers (player_id, round, match_id) VALUES (1, 'R32', <match_id>) ON CONFLICT (player_id, round) DO UPDATE SET match_id = EXCLUDED.match_id;"
```

Run `pnpm sim leaderboard` (with that match settled) to see the doubled points apply.

---

## 10. Test the admin flows

### Admin login

`/admin` → enter the password matching `ADMIN_PASSWORD_HASH` in your `.env.local` (the value you generated with `pnpm admin:hash 'whatever'`).

### Score override

`/admin/dashboard` → "Override match score". Pick a match, enter scores, save. The cron will not clobber them while `admin_overridden = true`.

```sh
psql "$POSTGRES_URL" -c "SELECT id, status, admin_overridden, home_score, away_score FROM matches WHERE admin_overridden = true;"
```

### Bonus resolution

`/admin/bonuses` → Pick a bonus, set the resolution (e.g. WINNER → team id). Run `pnpm sim leaderboard` or refresh `/leaderboard` to see bonus points credited.

### Audit log

`/admin/dashboard` shows the audit log. Each admin action and each cron run drops a row.

---

## 11. Reset utilities

| Command | What it does |
|---|---|
| `pnpm sim reset` | Wipes all sim data (matches, players, predictions, bonuses, jokers, audit log). Restores `tournament_kickoff` to 11 Jun 2026. |
| `pnpm db:seed` | Re-creates the settings row. |
| `pnpm restore` | Re-loads teams + matches from `data/wc2026-snapshot.json`. |
| `pnpm snapshot` | Writes current teams + matches to the snapshot JSON. Use after a healthy cron sync. |

After production changes you want to keep, `pnpm snapshot && git add data/ && git commit` to capture the new fixtures.

---

## 12. Mobile testing

Open the page in Chrome devtools, toggle the device toolbar (Cmd+Shift+M), pick iPhone 14. Spot-check:

- `/predictions` — score rows stack vertically, no horizontal scroll.
- `/today` — match cards readable, status badges visible.
- `/leaderboard` — table fits.
- `/bonuses` — pickers usable.

Hard-refresh (Cmd+Shift+R) after CSS changes — Next.js dev caches aggressively.

---

## 13. Backup + restore drill (do this once before the tournament)

Per `docs/tech-stack.md`:

```sh
# Capture a dump of the (local or prod) DB
pg_dump "$POSTGRES_URL" --no-owner --no-acl --format=custom --file=leworldcup-test.dump

# Restore it into a fresh DB to confirm
createdb leworldcup_restore_test
pg_restore --no-owner --no-acl --dbname=leworldcup_restore_test leworldcup-test.dump
psql leworldcup_restore_test -c "SELECT count(*) FROM predictions;"
dropdb leworldcup_restore_test
```

For prod: take a Neon branch from the dashboard before any risky migration. Branches are free and reversible.

---

## Troubleshooting

**`relation "teams" does not exist`** → migrations haven't been applied. `pnpm db:migrate`.

**Postgres can't connect** → `brew services list` should show `postgresql@16: started`.

**Page shows ZodError on env** → `.env.local` is missing or empty. `cp .env.example .env.local` and fill in.

**Mobile CSS looks wrong after a fix** → hard refresh (Cmd+Shift+R) to clear cached assets.

**Cron returns 401** → `Authorization: Bearer` header doesn't match `CRON_SECRET` env. Re-export both sides.

**Knockout scoring looks wrong** → check whether the canonical `home_score`/`away_score` got the AET-final value or just the 90-min. Football-data's `score.extraTime` should be folded into `home_score`/`away_score`; FT goes into `home_score_ft`. Inspect:
```sh
psql "$POSTGRES_URL" -c "SELECT id, round, status, home_score, away_score, home_score_ft, away_score_ft, home_score_pens, away_score_pens, winner_team_id, admin_overridden FROM matches WHERE id = <id>;"
```
