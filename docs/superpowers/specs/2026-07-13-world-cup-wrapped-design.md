# World Cup Wrapped — Design Spec

**Date:** 2026-07-13
**Status:** Approved for planning
**Author:** Eddie Long (with Claude)

A per-player, Spotify-Wrapped-style end-of-tournament recap for LeWorldCup2026 — the private
pick'em for ~11 friends. Presented as a swipeable card story in a modal over the leaderboard,
unlocked only once the tournament is fully adjudicated.

---

## 1. Goals & constraints

- **Audience & voice.** ~40-something Irish men. Playful, warm, **Hiberno-English**. Celebratory
  even for whoever finished last. No Americanisms; avoid "mates"/"blokes". See
  `[[project_wrapped_audience_voice]]`.
- **Per-player.** Each of the ~11 players gets their own Wrapped. One player stopped picking after
  a few games and has almost no data — they must get a kind, obvious persona and a complete-feeling
  (shorter) story with **no** cruel or nonsensical cards.
- **Aesthetic.** Reuse the existing "vintage scoreboard" design tokens in `app/globals.css`
  (cream `--paper`, navy `--ink`, torch-red `--tournament`, `--mustard`, `--pitch`; DM Mono
  numerals, Inter body; dashed perforated rules). Minimal / no new heavy dependencies.
- **Stack.** Next.js App Router, TypeScript, Drizzle/Postgres, Tailwind v4, vitest.

---

## 2. Product decisions (locked)

| Decision | Choice |
|---|---|
| Presentation | **Swipeable card story** (Spotify-Wrapped style), ~6–9 full-screen cards, top progress bar. |
| Entry point | A button **on the leaderboard**, three states (locked / fresh / reopen). |
| First view | On first post-unlock visit, Wrapped **auto-opens once** as a modal over the leaderboard. |
| Dismiss | ✕ / Esc / backdrop tap. On close, a Hiberno-English reassurance that it's reopenable. |
| Comparisons | **Allowed** — cards may compare a player to the group (all picks are public post-tournament). |
| Tone | Playful & warm, Hiberno-English (see §1). |
| **Unlock gate** | **FINAL is `FINISHED` AND the `WINNER` bonus resolution is set.** Not the final whistle alone — manual bonuses (Golden Boot, Pantomime Villain, etc.) are resolved by admin *after* the final, so unlocking earlier would show false "0 bonuses landed" cards. |
| **Freshness** | **Freeze at unlock.** Each player's card payload is computed once and persisted, so a later admin score correction can't silently mutate a Wrapped someone already screenshotted (keepsake model). |

---

## 3. The persona system (Card 1)

Every player gets **exactly one** persona, assigned by a **strict priority ladder** — evaluate
top to bottom, first match wins. Deterministic (pure function of settled data, inputs sorted by
`playerId`; no `Math.random`, no reliance on DB row order).

### 3.1 Anti-contradiction rules (non-negotiable)

These exist because rate-based superlatives otherwise *invert the leaderboard* — a player with one
lucky exact pick has a 100% exact-rate and would out-rank the actual winner. A provably-false
sentence on a real friend's card is the primary risk of this feature.

1. **Superlative/titular framing only on the true ranking metric** (total points). Every other
   persona uses **descriptive** language ("you had a sniper's eye"), never titular ("THE best in
   the group"). Descriptions cannot contradict the standings.
2. **Minimum-sample gate** (`filed ≥ 5`) on any rate-based persona. The drop-out and the
   one-lucky-pick player can never claim an accuracy crown.
3. **Genuine care is aimed at ONE player: the drop-out** (Early Retirement / Ghost) — because
   disengagement can have a real-life reason the app can't see. They get hand-authored warm copy,
   routed away from the roast generator. A player who **turned up and played badly is fair game**
   for a proper slagging — the whole point of the group. Last place who *participated* gets a
   cheeky, affectionate roast, not coddling: the joke is on the *performance*, which is honest and
   funny, never on their character or worth. Roast the results all you like; just don't
   sanctimoniously punch down at someone for not being *able* to play.

### 3.2 The ladder

| # | Persona | Assignment rule | Subtitle intent |
|---|---------|-----------------|-----------------|
| 1 | **The Early Retirement** | `participationRate < 0.25` AND all filed picks fall in the earliest ~20% of matches by kickoff. | Warm, self-aware. "You filed a few, then rode off into the sunset. We kept your seat warm." |
| 2 | **The Ghost** | `participationRate < 0.25`, scattered (didn't qualify for #1). | Warm, **no numbers**. |
| 3 | **The Champion** | `finalRank === 1`. | "Top of the pile on {totalPoints}. Insufferable, and entitled to be." |
| 4 | **The Oracle** | `exactCount === max(exactCount)` AND `exactCount ≥ 3`. | "{exactCount} exact scorelines. Are you well? That's not normal." |
| 5 | **The Contrarian** | Owns the single boldest *correct* pick in the group (max boldness among correct picks; see §5). | "You called it when nobody else dared." |
| 6 | **The Bonus Merchant** | `bonusPoints === max(bonusPoints)` AND `bonusPoints > predPoints × 0.4`. | "Your edge came off the bonus board." |
| 7 | **The Metronome** | `hitRate ≥ median` AND `participationRate ≥ 0.9` AND `exactRate ≤ median`. | "No fireworks, just a steady drip of points." |
| 8 | **The Wooden Spoon** | `finalRank === lastRank` AND `participationRate ≥ 0.5`. Turned up, played, finished dead last — fair game for a proper slagging on the *performance*. | Cheeky and affectionate, not coddling. "Dead last of the eleven. Someone has to prop up the table, and by God you committed to the role." |
| 9 | **Steady Eddie** | Catch-all. Guarantees total coverage. | "A solid, sensible campaign." |

Ties on a threshold (two players share `max(exactCount)`) are allowed — both can be "The Oracle"
with shared/descriptive copy. Only per-player assignment must be deterministic, which it is (each
player runs the ladder independently).

---

## 4. Card lineup (after the persona card)

Every card is a pure `(playerData) → Card | null`. **Omission is a first-class, tested outcome** —
no divide-by-zero, no "0 of 0". A minimum viable Wrapped of ~3 always-safe cards (persona, "here's
your tournament", sign-off) guarantees even the drop-out a complete story. Slag the performance
freely; the only line is not punching down at the drop-out for *not being able to play* (§10).

| # | Card | Stat shown | Computation | Group comparison | Degrade rule |
|---|------|-----------|-------------|------------------|--------------|
| 2 | **The Damage** | Total points, split pitch vs bonus board | From `PlayerLeaderboardRow`. | "X above/below the group average." | Always renders. |
| 3 | **Your Best Call** | Highest-value correct prediction | See §5. | "Only N others called it." | Null if no scoring pick → fallback warm copy. |
| 4 | **Your Worst Call** | Biggest confidently-wrong pick | See §5. | "The group got this X% right." | **Suppressed only if `filed < 3`.** Otherwise fair game — the slagging is on the pick, not the person. |
| 5 | **Where You Peaked** | Highest rank ever held + the match that caused it | `min(rank)` across `leaderboardSnapshotRows` + that snapshot's `causeMatchId`. | — | Null if no snapshots. |
| 6 | **The Journey** | Sparkline of rank over time, player's line highlighted | Ordered `rank` from snapshot series. | Winner's line faint for contrast. | Null / static if single snapshot. |
| 7 | **The Bonus Board** | Each bonus pick + hit/miss | `computeBonusBreakdownByPlayer` entries. | "Your dark horse got further than N others'." | **Omitted entirely if no bonus picks** (never "0 of 0"). |
| 8 | **The Verdict** | Final rank + one superlative the player genuinely owns; confetti; screenshot-friendly | `finalRank` + first owned group-max stat. | This card *is* the comparison. | Always renders; last place gets a cheeky verdict, not a soft one. |

### 4.1 The comparison denominator (one, fixed, stated in copy)

All "N of M" comparisons use a **single denominator**: players with **≥1 settled prediction**,
phrased as *"of the N who saw it through"*. Ranking uses the existing **1224 competition ranking**
(`computePointsOnlyRank`) so ties read as "top 3", never a fake-precise "beat 8 of 11" that counts
people who tied you. Never compare a low-data player with ranked "more accurate than…" language —
substitute a non-competitive stat ("you and 10 others picked 3,000+ scorelines between you").

---

## 5. Best / worst call mechanics

Computed per player over their predictions vs **FINISHED** matches only. Uses AET-final
`homeScore`/`awayScore` (never `homeScorePens`) so cards never contradict the leaderboard on
shootout matches.

- **Best call** = prediction with highest `predictionPoints(match, pred)`.
  Tie-break: higher points → was exact → higher boldness → later kickoff. (No joker multiplier —
  the joker was never exposed, so no `jokers` rows exist; see §8.)
- **Worst call** = among picks that scored 0 against a real result, max
  `missMargin = |predHome − actualHome| + |predAway − actualAway|`. Tie-break: bigger margin →
  wrong outcome → predicted the loser to win → bolder scoreline. Suppressed if `filed < 3`.
- **Boldness** (drives The Contrarian + best-call tie-break): using all players' picks for that
  match, `boldness = 1 − (players sharing your outcome) / (players who filed it)`. Range 0–1.
- **Penalty-shootout / cancelled / postponed matches** are excluded from all denominators; a
  pens-decided knockout is a draw for scoring, so "you called it" never fires on a pens-loser.

---

## 6. Architecture

Mirrors the existing `LeaderboardChart` (server loader) → `LeaderboardChartClient` (interactive)
split, and the pure-engine-in-`lib/` convention of `lib/scoring.ts`.

### 6.1 New files

| File | Kind | Role |
|---|---|---|
| `lib/wrapped.ts` | pure | `buildWrapped(input) → Map<playerId, WrappedData>`, `isTournamentComplete`, `isWrappedUnlocked`, persona ladder, best/worst/boldness. No DB, no I/O. |
| `lib/wrapped.test.ts` | test | Unit tests (see §9). |
| `app/leaderboard/_components/WrappedGate.tsx` | server | Computes unlock predicate; on unlock, ensures the frozen payload exists; renders the entry button + mounts the client modal with the current player's serialized payload. |
| `app/leaderboard/_components/WrappedModalClient.tsx` | client | Card-story overlay: swipe/tap/keyboard nav, progress bar, ✕ close, auto-open-once, reassurance toast, focus-trap, scroll-lock, a11y. |
| `app/leaderboard/_components/WrappedCards.tsx` | client | Presentational card components (persona, damage, best/worst, peak, journey, bonus board, verdict). |
| `app/wrapped/[playerId]/page.tsx` | server | Full-page Wrapped route — the eventual share link **and** the dev preview surface (§7). |

`buildWrapped` computes **all** players in one pass (group aggregates are needed for the
comparison cards), then only the current player's `WrappedData` is serialized across the
server→client boundary. `Map` → plain object, `Date` → epoch (mirrors `LeaderboardChart`).

### 6.2 Unlock gate (pure, server-verified)

```ts
// FINAL finished AND the terminal admin-set bonus is resolved.
isTournamentComplete(matches): boolean            // round==="FINAL" && status==="FINISHED"
isWrappedUnlocked(matches, resolutions): boolean  // isTournamentComplete && WINNER resolution set
```

Never trusted from the client. Both the leaderboard button and the `/wrapped` route call it.

### 6.3 Freeze-at-unlock + "seen" (single mechanism)

Because we freeze the payload, both problems are solved by **one small piece of persistent state**
rather than localStorage:

- A persisted per-player Wrapped payload (the frozen cards), written once when the gate first
  passes. A later admin correction does **not** silently overwrite it.
- The **auto-open-once** flag rides along as a per-player `seenAt` on the same record — so
  "auto-open once" is honoured **across devices** (localStorage would break this the moment someone
  opens on phone after desktop). Auto-open fires when `seenAt` is null; ✕ sets it; reopen never
  clears it.

> Implementation note for the plan stage: choose the storage shape (a `wrapped` table keyed by
> `playerId`, or columns on `players`). A dedicated table is cleaner and keeps `players` lean;
> decide during writing-plans. Two tabs both seeing `seenAt === null` and both auto-opening is an
> acceptable race — the reopen affordance is always present.

---

## 7. Local testing (priority)

### 7.1 Produce a completed, unlockable tournament

```sh
pnpm sim run --seed=42 --players=12   # reset + play every round + resolve bonuses (sets WINNER)
pnpm backfill:snapshots               # populate leaderboardSnapshots for the journey cards
pnpm dev                              # /leaderboard — button enabled, auto-opens once
```

Vary for coverage (matches depend on seed, ranks on player count):

```sh
pnpm sim run --seed=1  --players=12   # full field
pnpm sim run --seed=7  --players=4    # small field → "of 3" comparison copy
pnpm sim run --seed=99 --players=12   # different winner / personas
```

Finish a stopped run: `pnpm sim play` → `pnpm sim resolve` → `pnpm backfill:snapshots`.
Force just the final by hand: settle the `round='FINAL'` match via `pnpm sim play-match --id=<id>
--home=2 --away=1`, then `pnpm sim resolve`. (Skipping `resolve` is a good way to test the
**locked** state — WINNER stays unset, gate stays shut.)

### 7.2 The ghost is currently unrepresentable — sim change required

`scripts/sim.ts` files **every** player a complete slate (all predictions + all bonuses). The
highest-risk case — the drop-out — cannot be produced today. **Add a `--ghost=N` flag** that files
only a few early predictions for N players and skips their bonus/joker inserts. This is a
prerequisite for honestly testing the feature.

### 7.3 Preview any player + bypass "seen"

Dev-only, guarded by `NODE_ENV !== "production"` (mirrors `lib/bonus-lock.ts` override):

```
/wrapped/<playerId>                 # real gate, real player
/wrapped/<playerId>?preview=1       # dev-only: force-render even if locked; never writes seenAt
/wrapped/<playerId>?preview=1&card=3  # deep-link a card for design iteration
```

To retest auto-open: DevTools → clear the seen state (or, with DB-backed seen, a dev-only reset).

### 7.4 Production data, safely

Least-risk path (per `docs/SIMULATION.md`): `pnpm snapshot` on prod → `pnpm restore` locally.
This copies **only teams + matches** (upsert on `code`/`externalId`) — it never touches
`predictions`, `bonusPicks`, `jokers`, or the `players` table, so **no emails, no password hashes,
no PII cross the boundary**. For a realistic Wrapped, layer synthetic picks over the real fixtures
with the sim. Only if a *real*-prediction repro is essential, take a dump that excludes
`players`/`password_reset_tokens`/`audit_log` and scrub display names — default to snapshot+sim.

---

## 8. Data feasibility — cut list

- **Jokers** — the joker was never exposed in the UI, so no `jokers` rows exist. There is **no
  Gambler persona and no joker copy or multiplier anywhere** in Wrapped. (Schema/scoring retain
  joker support for history; Wrapped simply ignores it.)
- **Card/booking counts** (Pantomime Villain narration) — **no data source**. Usable only as a
  bonus hit/miss via `bonusResolutions`, never as a narrated count.
- **Team allegiances / "your teams" / clean sheets** — **cut**. We model per-match scorelines, not
  which teams a player supports.
- **Named head-to-head rivalries** — **cut**. Fragile at 11 players, and named negativity is a
  social risk (§10).

---

## 9. Unit tests (`lib/wrapped.test.ts`, mirroring `scoring.test.ts`)

- `isTournamentComplete`: false without a FINAL / when FINAL not FINISHED; true only on FINAL FINISHED.
- `isWrappedUnlocked`: false when FINAL finished but no WINNER resolution; true only when both hold.
- Persona per rung: focused test each (Champion, Oracle, Contrarian, Bonus Merchant, Metronome,
  Wooden Spoon, Early Retirement, Ghost, Steady Eddie catch-all).
- Comparison math: distinct exact counts → `moreAccurateThan` counts peers strictly below; "of N"
  denominator excludes zero-data players.
- Ties: `>` not `>=`; whole-group tie → 1224 shared rank; final-rank ties via `computePointsOnlyRank`.
- Low-data player: no `NaN`/`-Infinity`/empty-`reduce` throw; best/worst omitted; valid fallback persona.
- Won-nothing player: empty `bonusHits`, no undefined fields, sensible superlatives.
- Single-snapshot journey: `biggestClimb` null, no crash.
- Determinism: same input → deep-equal output twice.

Run `pnpm test` and `pnpm typecheck` after changes (per `[[feedback_run_tests_after_changes]]`).

---

## 10. Social-risk guardrails (real friend group)

This is a group of lads who slag each other rotten — that's the fun, and a terrible campaign should
be roasted, not coddled. The tone should be cheeky and unsparing about **performance**. There is
exactly **one** guardrail worth keeping: don't punch down at the **drop-out** for not being *able*
to play, because disengagement can have a real-life reason the app can't see.

- **Roast the results freely.** A bad rank, a mad scoreline, a bonus board of misses — all fair
  game, and funnier for being honest. Last place gets a proper slagging on the *performance*.
- **The one soft touch: the drop-out.** Early Retirement / Ghost get hand-authored copy that ribs
  the disappearance lightly ("rode off into the sunset") without moralising about effort or implying
  they couldn't hack it. Slag the *absence* with a wink, not the person.
- **Roast the pick and the person's record, not their character.** "You backed Brazil like a
  headcase" is grand; nothing about who they are as a human.
- **No named-rival negativity.** "Below a specific person" → aggregate language ("mid-table
  respectability") — avoids reigniting real needle, and dodges any copying/cheating implication.
- **Hiberno-English authenticity.** Keep: "in fairness", "sure look", "grand", "gas", "notions",
  "fair play", "chancer", "some man for one man". **Ban Americanisms:** "crushed it", "MVP",
  "clutch", "soccer", "gameday", "you da man". Football, never soccer. Emoji sparingly
  (a 👑 or 🥄, not a wall of 🔥💯).

---

## 11. Risks / must-fix before ship (from the QA + devil's-advocate pass)

1. Every card `→ Card | null`; "0 of 0" impossible; all rate/best/worst cards guarded. **(P0)**
2. Unlock gate = FINAL finished **AND** bonuses resolved, not the final whistle alone. **(P0)**
3. No superlative persona without the sample-size gate; superlatives only on total points. **(P0)**
4. One comparison denominator, stated in copy; 1224 ranking for honest tie phrasing. **(P0)**
5. Warmest hand-authored copy for last place + drop-out; ban Americanisms. **(P0)**
6. Freeze the payload at unlock; carry the cross-device "seen" flag on the same record. **(P1)**
7. Extend the sim with `--ghost=N` — the highest-risk case is untestable without it. **(P0 for testability)**
8. Serialization boundary: `Map`→object, `Date`→epoch, or props arrive empty. **(P1)**
9. `/wrapped?preview=1` must be dev-gated, or it leaks other players' Wrapped in prod. **(P0)**

---

## 12. Suggested build order

1. `lib/wrapped.ts` pure builder + `lib/wrapped.test.ts` (personas, best/worst, unlock gate).
2. `--ghost=N` sim flag so the drop-out case is testable.
3. Unlock gate + three button states in `WrappedGate` / leaderboard.
4. Overlay shell: scroll-lock, focus-trap, a11y, progress bar, tap/swipe/keyboard nav.
5. Card components (theme-per-card, reuse `Confetti`, `flag()` from `lib/utils`, `.dashed-rule`,
   flip-board numerals).
6. Freeze-at-unlock persistence + auto-open-once + reassurance toast + `/wrapped/[playerId]` route.
7. (Fast-follow) canvas-rendered share image + Web Share API — dependency-free, out of v1 core.
