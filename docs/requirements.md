# LeWorldCup 2026 — Requirements

> Living document. Update freely as decisions evolve. Last updated: 2026-05-15.

## 1. Goal

Replace the 2022 Google Sheets game with a small, self-administered website for a private FIFA World Cup 2026 pick'em among **~12 friends**. Must be **fun**, **easy to administer**, and **cheap** (free or near-free) to host for ~5 weeks (mid-June → mid-July 2026).

The 2022 game (`LeWorldCup2022.pdf`) is the baseline: predict scorelines for every match, 2 / 4 pts in groups, 3 / 6 in knockouts. We carry that forward and layer **bonus picks** on top to make 2026 livelier.

## 2. Audience and scale

| Dimension | Value |
|---|---|
| Players | ~12 |
| Concurrency | Single-digit |
| Match volume | ~104 matches over ~30 days |
| Admin updates | ~5–6 per day on heavy days |
| Public access | Leaderboard / breakdowns visible to logged-in players only |

## 3. Locked-in decisions

| Topic | Decision |
|---|---|
| **Game format** | Hybrid: per-match score predictions **plus** bonus picks |
| **Bonuses** | Tournament winner, top scorer, group winners, dark horse, wooden spoon, first goal scorer, joker (double-down per knockout round) |
| **Auth** | Shared invite code + display name. Separate admin password for the owner |
| **Score entry** | Auto-pulled from football-data.org free tier; admin can override |
| **Hosting** | Vercel (Hobby) + Vercel Postgres |
| **Pick lock** | Per-match at kickoff. Bonus picks lock at tournament kickoff |
| **Late joiners** | Closed at tournament kickoff |

## 4. Functional requirements

### 4.1 Sign-up / login
- F-1.1 New player enters invite code + email + a unique display name + password (≥6 chars). Player record is created with the scrypt-hashed password; session cookie set.
- F-1.2 Returning player logs in with **email + password**. Display name is the public-facing label only — it is no longer an authentication factor.
- F-1.3 Admin logs in via separate password (single-tenant; only one admin = the owner).
- F-1.4 New sign-ups are blocked once tournament has kicked off.
- F-1.5 Owner can rotate the invite code at any time. Existing players keep their passwords.
- F-1.6 **Password reset:** if `RESEND_API_KEY` is configured, `/forgot` mails a single-use 60-minute reset link backed by a SHA-256-hashed token. Without Resend, only an admin can clear `password_hash` (or the row) so they can sign up again.

### 4.2 Predictions
- F-2.1 Every player can enter a predicted scoreline for every match in the tournament.
- F-2.2 A prediction is editable until that match's kickoff (UTC), then locked permanently.
- F-2.3 Missing predictions score zero — no auto-default.
- F-2.4 The picks UI must clearly communicate which matches are still editable, locked, or upcoming.

### 4.3 Bonus picks
- F-3.1 Every player must enter all bonus picks before tournament kickoff. Missing bonuses score zero.
- F-3.2 Bonus selectors are constrained (only valid teams / players selectable; group winner picker shows the four teams in that group).
- F-3.3 Once tournament kicks off, all bonus picks are locked.
- F-3.4 Joker (double-down) is selected once per knockout round, lockable at that round's first kickoff.

### 4.4 Scoring
- F-4.1 Group stage match: **2 pts** for correct result (W/D/L), **4 pts** for exact score (4 is the total — not additive).
- F-4.2 Knockout match: **3 pts** for correct result (90 min + ET; penalties decide the "winner" for advancement-based picks but match prediction uses the result after 90 min unless agreed otherwise — finalize in `game-design.md`).
- F-4.3 Knockout match: **6 pts** for exact score.
- F-4.4 Joker doubles the player's prediction points for the chosen match in that round.
- F-4.5 Detailed bonus point values are in `game-design.md`.
- F-4.6 The leaderboard tie-breaker order is in `game-design.md`.

### 4.5 Browse / transparency
- F-5.1 Leaderboard sorted by total points, with ranks.
- F-5.2 Each player has a profile page showing every prediction, every bonus pick, points earned per match and per bonus, joker selections.
- F-5.3 Each match has a page showing every player's prediction and points earned.
- F-5.4 Other players' predictions are hidden until that match kicks off (anti-copy). Bonus picks are hidden from other players until tournament kickoff.

### 4.6 Admin
- F-6.1 Override match scores, edit any player's predictions or bonus picks, manage players (rename, remove, manually add late joiner if explicitly chosen), trigger immediate API sync, edit invite code, and edit lock times if needed.
- F-6.2 Admin actions logged (audit trail) so I can sanity-check what I touched.

### 4.7 Auto-sync
- F-7.1 Cron runs every 30 minutes during the tournament window calling football-data.org for fixtures, results, and goal scorers.
- F-7.2 New results trigger leaderboard recalculation (the scoring engine is pure / deterministic; recompute is cheap).
- F-7.3 Sync failures are logged and surfaced in the admin area.

### 4.8 Rules page
- F-8.1 A `/rules` page documents scoring, bonuses, lock rules, tie-breakers in plain English. Linked prominently from every page.

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| NF-1 | Total monthly cost ≤ $5; target $0 |
| NF-2 | Page load ≤ 1.5 s on 4G; total JS budget reasonable for a small site |
| NF-3 | All data backed up daily; Neon point-in-time recovery is acceptable, but a nightly `pg_dump` artifact is also stored somewhere durable |
| NF-4 | Local-first: full app must run via `docker compose up` + `pnpm dev` with no Vercel dependency for development |
| NF-5 | Source of truth is GitHub: `git@github.pie.apple.com:eddie-long/LeWorldCup2026.git` |
| NF-6 | All decisions and rules live in `docs/` and are part of the repo, versioned with the code |

## 6. Out of scope (for v1)

- Multi-tournament support (one WC, one season, hardcoded acceptable)
- Mobile native apps (mobile-responsive web is enough)
- Push notifications / SMS
- Real-money payments
- Multi-admin
- SSO / OAuth providers

## 7. Open questions

- _(none currently — moved to in-progress decisions in `game-design.md` and `tech-stack.md`)_

## 7a. Deferred work (timed)

- **Footballer player typeahead** — the Top Scorer and First Goal Scorer bonus pickers currently take free-text. Once FIFA squad lists are finalized (≈ early June 2026, ~7 days before opening match), import them into a `tournament_players` table and swap the inputs for a proper select. Existing free-text picks should resolve by exact name match; admin script reconciles any mismatches. Source: api-football.com or FIFA's official squad page.

## 8. Companion docs

- [`wc2026-tournament.md`](./wc2026-tournament.md) — fixtures, groups, knockout structure, API source
- [`game-design.md`](./game-design.md) — bonus rules, point values, edge cases, picks UX flow
- [`tech-stack.md`](./tech-stack.md) — chosen libraries, project layout, deployment, UI direction
- [`rules.md`](./rules.md) — player-facing rules page (mirrors `/rules` route content)
