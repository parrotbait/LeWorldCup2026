# LeWorldCup2026 — Game Design

A private pick'em for ~12 friends covering the FIFA World Cup 2026 (48 teams, 12 groups, Round of 32 onward). This document finalizes scoring, bonus mechanics, tie-breakers, and the picks UX so engineering can implement without guessing.

Where rules carry forward from our **2022 game** (`LeWorldCup2022.pdf`), they are flagged `[2022 carry-forward]`. Where 2026 differs (Round of 32, 12 groups, dark horse, joker), it is flagged `[2026 new]`.

---

## 1. Scoring Summary

| Source | Points | Notes |
|---|---|---|
| Group-stage match — correct result (W/D/L) | **2** | `[2022 carry-forward]` |
| Group-stage match — exact scoreline | **4** | Includes the 2; not additive. `[2022 carry-forward]` |
| Knockout match — correct result | **3** | Result based on the score at end of 90 min (or end of ET if it went to extra time). **Penalty shootouts do not count for prediction scoring** — a knockout decided on pens is a draw for our purposes. `[2022 carry-forward]` |
| Knockout match — exact scoreline | **6** | Scoreline at end of 90 (or end of ET if drawn at 90). Pens not counted. Not additive. `[2022 carry-forward]` |
| Joker — doubles one knockout match per round (R32 / R16 / QF only) | **×2** | **Hidden in the v1 UI** — re-introduce later. Applies to whatever match score above resolves to. `[2026 new, deferred]` |
| Wooden spoon (worst-placed team in worst group) | **5** | `[2022 carry-forward]` |
| Top scorer / Golden Boot | **10** | `[2022 carry-forward]` |
| Most assists | **10** | Top assister(s). Shared payout same as Golden Boot. `[2026 new]` |
| Dark horse — per round survived | **2 / 4 / 6 / 10 / 15 / 20** | R32 / R16 / QF / SF / Final / Champion. Max 57. `[2026 new]` |
| Tournament winner | **25** | `[2022 carry-forward]` |

### Hall of Shame `[2026 new]` — anti-bonuses

These reward correctly identifying who's going to be **rubbish**. Same lock window as other bonuses (tournament kickoff).

| Source | Points | Notes |
|---|---|---|
| Pantomime villain | **5** | Team with the most yellow + red cards across the tournament. |
| The Sieve | **5** | Team that concedes the most goals overall. |
| How the mighty have fallen | **8** | A Pot-1 (top-seeded) team that fails to make the knockouts. Higher pay-out because going against the favourites is a bigger call. |

If multiple teams tie on the underlying metric (e.g. two teams equal on cards), every player who picked any of the tied teams collects the full points — same principle as a shared Golden Boot.

**Theoretical maximum** (perfect predictions, all bonuses, every joker doubled): roughly 600 pts. We expect winners around 180–230.

---

## 2. Detailed Bonus Rules

All bonus picks lock at the moment **the first match of the tournament starts** — concretely, when the earliest-kickoff fixture's stored kickoff has passed OR its status moves off `SCHEDULED` (whichever fires first). This is derived from match data, not from a configurable setting, so the lock can't drift if admin forgets to update anything. Once locked, bonuses can't be edited.

### 2.1 Tournament Winner — 25 pts
- Pick one of the 48 teams.
- Awarded only if that team lifts the trophy.
- No partial credit (use Dark Horse for partial-credit thrills).

### 2.2 Top Scorer / Golden Boot — 10 pts
- Pick one player from any of the 48 squads.
- Awarded if your player wins the official FIFA Golden Boot.
- **Shared boot:** if FIFA awards the Golden Boot to multiple players (rare, but tiebreakers can fail), every player who picked any of the joint-winners gets the full 10 pts.
- **Injured / withdrawn before tournament:** player auto-replaced via in-app prompt **before tournament kickoff** only. After kickoff, no replacement — you took the risk.
- **Not in final squad:** treated as not playing; no replacement after kickoff.

### 2.2b Most Assists — 10 pts `[2026 new]`
- Pick one player from any of the 48 squads. Mirrors Golden Boot mechanically.
- Awarded if your player tops the tournament assist count.
- **Shared:** if multiple players are tied at the top, every player who picked any of the tied winners gets the full 10 pts.
- **Source:** football-data.org `/scorers` exposes per-player `assists`. If the free tier ever stops returning assists, admin resolves manually from FIFA's official stats.
- Same injury / withdrawal handling as Golden Boot.

### 2.3 Group Winners — REMOVED in v1
Originally on the list (3 pts × 12 groups, max 36) but cut from the v1 picks UI to keep bonus selection manageable. Schema retains the `GROUP_WINNER` enum value for any historical / sim data; no new picks can be made.

### 2.4 Dark Horse `[2026 new]`
**Eligibility (objective):** any team **not in Pot 1** at the official draw. Pot 1 in 2026 = the three hosts (USA, Mexico, Canada) plus the nine top-ranked qualifiers (Spain, Argentina, France, England, Brazil, Portugal, Netherlands, Belgium, Germany). The picker filters Pot-1 teams out. Pot membership is set in `teams.pot` via `pnpm tsx scripts/set-pots.ts`.

**Payout — cumulative per round survived:**

| Stage reached | Pts (this stage) | Running total |
|---|---|---|
| Survives groups (into R32) | 2 | 2 |
| Reaches R16 | 4 | 6 |
| Reaches QF | 6 | 12 |
| Reaches SF | 10 | 22 |
| Reaches Final | 15 | 37 |
| Wins tournament | 20 | **57** |

- **Eliminated in groups:** 0 pts. No replacement.
- One pick, locked at tournament kickoff.

### 2.5 Wooden Spoon — 5 pts
- Pick the team you think finishes **bottom of their group** with the fewest points overall across the whole group stage.
- Tiebreak across groups: fewest points → worst goal difference → fewest goals scored → coin flip (admin).
- If multiple teams tie on all official metrics across groups, **all picks of any tied team win**.

### 2.6 First Goal Scorer — REMOVED
Originally on the list (5 pts) but cut from the bonus set: too noisy at our scale, and the marquee bonuses (Golden Boot, Dark Horse) cover the player-pick thrill already. Schema retains the data column historically; the `FIRST_GOAL_SCORER` enum value has been removed.

### 2.7 Joker / Double-Down `[2026 new, deferred]` — ×2 multiplier
**Hidden from the v1 UI.** Built and tested but the navbar entry was pulled and the bonuses page doesn't surface it, to keep first-time-player friction low. When re-introduced:
- **Once per knockout round:** R32, R16, QF only. Three total — semis / 3rd / final have too few matches for ×2 to feel meaningful.
- Pick **one match in that round**; your prediction points (result and/or exact) are doubled.
- Must be selected **before kickoff of the first match in that round**. Once that round's first match starts, your joker for the round is locked to whatever you've selected (or void if you didn't pick).
- If you forget to pick: no joker that round, no rollover.
- Joker doubles **only the match prediction points**, not bonus points.

### 2.8 Hall of Shame anti-bonuses `[2026 new]`
Three picks rewarding identifying which teams will be rubbish. Same lock window as other bonuses (first match's kickoff). Tied teams credit every player who picked any of them.

- **Pantomime villain — 5 pts.** Team with the most yellow + red cards across the tournament. Resolved by admin once the tournament ends (football-data does carry bookings; manual resolution is the safe path until we wire automation).
- **The Sieve — 5 pts.** Team that concedes the most goals overall. Auto-derivable from match results; the admin still ratifies in `/admin/bonuses` for tie handling.
- **How the mighty have fallen — 8 pts.** A Pot-1 team that fails to make the knockouts (no R32 appearance). Picker is filtered to Pot-1 teams only. **If every Pot-1 team advances, no points are awarded** — the bonus is structurally inert that tournament.

### 2.9 Admin Score Overrides
- Source of truth: official FIFA result feed via football-data.org.
- If the API is wrong (wrong scorer, wrong scoreline), `/admin/matches` lets the owner correct any match. Overrides set `admin_overridden=true` so the cron sync won't clobber the corrected value. Recomputation is implicit — the leaderboard reads through `computeBonusPointsByPlayer` + `buildLeaderboard` on every page load, so changes show up the next time anyone reloads.

---

## 3. Tie-Breaker — Overall Leaderboard

Applied in order:

1. **Total points**
2. **Number of exact-score predictions** (group + knockout combined)
3. **Bonus points** (sum of all bonus categories, excluding match predictions)
4. **Number of correct knockout results** (proxy for late-tournament accuracy)
5. **Earliest signup timestamp** (rewards the keen)
6. **Coin flip by admin** (if we somehow get here, we deserve it)

---

## 4. Picks UX Flow

### 4.1 First-Login Flow

1. Enter shared invite code → enter display name → done. No email.
2. Land on **Home / Leaderboard** with a friendly nudge: *"Welcome! You haven't made any picks yet — let's fix that."*
3. Two prominent CTAs: **Make Match Predictions** and **Lock In Bonuses**.
4. A countdown clock shows time-to-tournament-kickoff (when bonuses lock).

### 4.2 Predictions Screen

- **Default grouping: by matchday** (chronological), with sticky day headers. Most natural way to fill out as the tournament approaches.
- **Toggle: "By Group"** for the group stage — useful for filling all of Group A's matches in one go.
- Each match row: flags, team names, two score steppers (`-` `+`), kickoff time, lock countdown. Auto-saves on change.
- Knockout matches show TBD until brackets resolve; once teams are known, the row becomes editable.

### 4.3 Bonuses Screen

- One screen, six sections, scrollable. Locked sections grey out post-kickoff.
- Each section shows the points on offer and a one-line rule reminder.
- Selectors are single-pick dropdowns (with team flags / player headshots where possible).
- Big "Lock in your bonuses" CTA at the bottom that just confirms — picks auto-save individually too.

### 4.4 Joker Prompt

- Push notification + home-screen banner appears 24 hours before each knockout round's first kickoff: *"Pick your Joker for the Round of 32 — doubles your points on one match."*
- Tap → list of that round's matches → pick one → confirm.
- Banner remains until joker is picked or round starts.

### 4.5 Wireframes

**Home / Leaderboard**

```
+------------------------------------------+
| LeWorldCup 2026             [me: 47 pts] |
+------------------------------------------+
| Next: ENG vs GER  in 2h 14m              |
| Joker for QF: not picked yet  [Pick >]   |
+------------------------------------------+
| #  Player           Pts   Last 3         |
| 1  Big Dave          92   +6 +4 +2       |
| 2  Sarah-Bot         88   +4 +4 +0       |
| 3  Eddie             83   +2 +0 +6       |
| 4  Pundit Phil       79   +0 +4 +4       |
| ...                                      |
+------------------------------------------+
| [Predictions]  [Bonuses]  [Rules]        |
+------------------------------------------+
```

**Predictions Screen**

```
+------------------------------------------+
| Predictions          [Matchday | Group]  |
+------------------------------------------+
| -- Matchday 1 — Thu 11 Jun --            |
|                                          |
| MEX [-][2][+] vs [-][1][+] CAN  19:00    |
|   locks in 2h 14m                        |
|                                          |
| ARG [-][3][+] vs [-][0][+] KSA  21:00    |
|   locks in 4h 14m                        |
|                                          |
| -- Matchday 2 — Fri 12 Jun --            |
| ...                                      |
+------------------------------------------+
```

**Bonuses Screen**

```
+------------------------------------------+
| Bonuses     locks at tournament kickoff  |
+------------------------------------------+
| Tournament Winner            25 pts      |
|   [ Argentina        v ]                 |
|                                          |
| Golden Boot                  10 pts      |
|   [ Kylian Mbappé    v ]                 |
|                                          |
| Group Winners (12 × 3 pts)   36 pts      |
|   A [Mexico v]   B [Spain v]  C [...]    |
|   ...                                    |
|                                          |
| Dark Horse (Pot 2-4 only)    up to 57    |
|   [ Morocco          v ]                 |
|                                          |
| Wooden Spoon                 5 pts       |
|   [ Tunisia          v ]                 |
+------------------------------------------+
```

**Joker Prompt**

```
+------------------------------------------+
| Round of 16 starts in 22h                |
| Pick your Joker — doubles your points    |
| on ONE match this round.                 |
+------------------------------------------+
| ( ) ENG vs SEN     Sat 14:00             |
| (o) FRA vs MAR     Sat 18:00             |
| ( ) NED vs USA     Sun 14:00             |
| ( ) BRA vs CRO     Sun 18:00             |
| ...                                      |
|                                          |
|        [ Lock in Joker ]                 |
+------------------------------------------+
```

---

## 5. Visibility Rules

**Recommendation:** picks are **hidden until that match's kickoff**, then become visible to everyone for the remainder of the tournament.

- **Before kickoff:** you only see your own picks. Prevents copying and keeps banter pure.
- **At kickoff:** everyone's picks for that match become visible on the match detail screen. Live during the game = max fun.
- **Bonuses:** hidden until tournament kickoff, then visible to all for the duration.
- **Joker:** hidden until the round's first kickoff, then visible.

Rationale: in a 12-person friend group, the joy is the *reveal* — seeing who backed Argentina to win 4-0 right as it kicks off. Pre-kickoff secrecy preserves the integrity of picks (no copying the smart kid). Post-kickoff transparency is where the group chat gold lives.

---

## 6. Friendly Micro-Copy & "Fun" Touches

Nice-to-haves (not all need to ship v1):

1. **Punny default display names** if a player skips entry: *"Pelé Sheeran"*, *"Kyl-ian Murphy"*, *"Mo Salah-meleh"*, *"Hairy Kane"*. Click to reroll.
2. **Banter notifications** when the leader changes: *"👑 Big Dave has snatched the lead from Sarah-Bot. The tyranny continues."*
3. **Cold-take alerts** when someone predicts something wild: *"Eddie has Brazil losing 0-3 to Canada. We salute the chaos."*
4. **End-of-round digest** posted to the group's preferred chat (Slack/iMessage/Discord webhook): top 3 movers, biggest single-match points haul, worst pick of the round, joker hits and misses.
5. **Dark Horse tracker** on home: *"Your dark horse Morocco is still alive — +6 pts so far, +10 if they reach the SF."*
6. **"You called it"** badge on the match screen for anyone who nailed the exact score, with a confetti animation.
7. **Wooden Spoon Watch** — mini-leaderboard of the worst-performing teams during groups, updated daily. Pure morbid fun.
8. **Final-day "What if?"** simulator: shows each player's max possible final score given remaining matches — drives engagement on the last weekend.
9. **Empty-state copy on Predictions:** *"No picks yet. The tournament won't predict itself."*
10. **Lock-imminent nudge:** push notification 1 hour before kickoff if you haven't predicted the next match: *"ENG vs GER in 1h. Don't be the person who leaves it blank."*

---

## Appendix — Open Implementation Questions for Engineering

These do not block the design but should be confirmed early:

- Source of truth for fixtures, scores, scorers, and Golden Boot resolution (FIFA feed, football-data.org, SportMonks).
- Squad data feed for player picks (Golden Boot).
- Push-notification channel (APNs only? web push? Slack/iMessage webhook for digests?).
- Admin tool for score overrides — minimum viable UI is a JSON editor behind a password.
- Time zone handling for kickoff locks — store UTC, render local.
