# LeWorldCup 2026 — Requirements

> Living document. Update freely as decisions evolve. Last updated: 2026-05-18.

## 1. Goal

Replace the 2022 Google Sheets game with a small, self-administered website for a private FIFA World Cup 2026 pick'em among **~12 friends**. Must be **fun**, **easy to administer**, and **cheap** (free or near-free) to host for ~5 weeks (mid-June → mid-July 2026).

The 2022 game (`LeWorldCup2022.pdf`) is the baseline: predict scorelines for every match, 2 / 4 pts in groups, 3 / 6 in knockouts. We carry that forward and layer **bonus picks** on top to make 2026 livelier.

## 2. Audience and scale

| Dimension | Value |
|---|---|
| Players | ~12 |
| Concurrency | Single-digit |
| Match volume | 104 matches over ~30 days |
| Admin updates | ~5–6 per day on heavy days |
| Public access | Leaderboard / breakdowns visible to logged-in players only |

## 3. Locked-in decisions

| Topic | Decision |
|---|---|
| **Game format** | Hybrid: per-match score predictions **plus** bonus picks |
| **Bonuses** | Tournament winner, top scorer (Golden Boot), dark horse, wooden spoon, first goal scorer, plus the Hall of Shame anti-bonuses (pantomime villain, the sieve, mighty fallen). Group winners and joker were on the original list but are out / hidden in v1 to keep the picks UI simple. |
| **Auth** | Per-user account: invite code (sign-up only) + email + display name + password (scrypt). Login is email + password. Optional self-serve password reset via Resend if `RESEND_API_KEY` is set. Separate admin password for the owner. |
| **Score entry** | Auto-pulled from football-data.org free tier; admin can override per match |
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
- F-2.2 A prediction is editable until that match has started — kickoff time has passed OR status has moved off `SCHEDULED` (LIVE / FINISHED). Both signals are checked client-side and on the server action.
- F-2.3 Missing predictions score zero — no auto-default.
- F-2.4 Knockout fixtures with unresolved teams (TBD placeholders before brackets fill) are non-editable; the row labels them "teams TBD".
- F-2.5 The picks UI must clearly communicate which matches are still editable, locked, finished, or TBD.
- F-2.6 Once a match has finished, the prediction row shows the actual scoreline and the points the player earned ("+4 exact" / "+2 result" / "missed" / "no pick").

### 4.3 Bonus picks
- F-3.1 Every player must enter all bonus picks before tournament kickoff. Missing bonuses score zero.
- F-3.2 Bonus selectors are constrained (only valid teams / players selectable).
- F-3.3 Once tournament kicks off, all bonus picks are locked.

### 4.4 Scoring
- F-4.1 Group stage match: **2 pts** for correct result (W/D/L), **4 pts** for exact score (4 is the total — not additive).
- F-4.2 Knockout match: **3 pts** for correct result (90 min + ET; penalties decide the "winner" for advancement-based picks but match prediction uses the result after 90 min unless agreed otherwise — finalize in `game-design.md`).
- F-4.3 Knockout match: **6 pts** for exact score.
- F-4.4 Detailed bonus point values are in `game-design.md`.
- F-4.5 The leaderboard tie-breaker order is in `game-design.md`.

### 4.5 Browse / transparency
- F-5.1 Leaderboard sorted by total points (predictions + bonuses), with explicit Pred / Bonus / Total / Exact columns. Player names link to per-player profiles.
- F-5.2 Per-player profile (`/players/[id]`) shows every fixture with redacted picks pre-kickoff and revealed picks once the match starts. Owner sees everything regardless. Includes totals strip and a "filed X / 104" count so you can see how diligent each player is.
- F-5.3 Per-match detail (`/matches/[id]`) shows the score plus every player's pick (including non-pickers as "no pick") and points, sorted by points high-to-low. Joker badge shown if a joker exists for that match.
- F-5.4 `/live` aggregates every in-play match plus matches finished in the last 24h, with all players' picks and live points, refreshing on every load.
- F-5.5 Other players' predictions are hidden until that match kicks off (anti-copy). Bonus picks are hidden from other players until tournament kickoff.

### 4.6 Admin
- F-6.1 `/admin/matches` overrides match scores per fixture; sets `admin_overridden=true` so the cron sync won't clobber the value.
- F-6.2 `/admin/bonuses` sets the resolved value(s) for each bonus kind. Multi-select supports ties (every player who picked any tied option collects). Dark horse is auto-derived from match progression — no editor.
- F-6.3 Cron sync can be triggered manually with the curl one-liner shown on the admin dashboard.
- F-6.4 Admin actions are written to `audit_log` for after-the-fact sanity-checking.
- F-6.5 Player management (rename / remove / late-joiner) and invite-code rotation are still on the TODO list.

### 4.7 Auto-sync
- F-7.1 Vercel cron hits `/api/cron/sync-results` every 30 minutes during the tournament window calling football-data.org for fixtures, scores, and statuses.
- F-7.2 The sync also backfills `teams.group_letter` from the GROUP-stage match data (football-data's `/teams` endpoint doesn't include group placements).
- F-7.3 New results trigger leaderboard recalculation on next page load (scoring is a pure function over current DB state — no caching to invalidate).
- F-7.4 Sync errors are written to `audit_log`.

### 4.8 Rules page
- F-8.1 `/rules` documents scoring, bonuses, anti-bonuses, lock rules, visibility, tie-breakers in plain English. Linked from the navbar.

### 4.9 Local development tooling
- F-9.1 `pnpm sim` simulator drives the full game loop locally with subcommands `reset`, `setup`, `play`, `play-next`, `play-match`, `resolve`, `leaderboard`, `run`. Seeded RNG → reproducible scenarios. See `docs/SIMULATION.md`.
- F-9.2 `pnpm snapshot` and `pnpm restore` capture / re-load the canonical teams + matches data to/from `data/wc2026-snapshot.json` so we don't depend on football-data.org being up.

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| NF-1 | Total monthly cost ≤ $5; target $0 |
| NF-2 | Page load ≤ 1.5 s on 4G; total JS budget reasonable for a small site |
| NF-3 | All data backed up daily; Neon point-in-time recovery is acceptable, but a nightly `pg_dump` artifact is also stored somewhere durable |
| NF-4 | Local-first: full app must run via Homebrew Postgres + `pnpm dev` with no Vercel dependency for development |
| NF-5 | Source of truth is GitHub: `git@github.pie.apple.com:eddie-long/LeWorldCup2026.git` |
| NF-6 | All decisions and rules live in `docs/` and are part of the repo, versioned with the code |
| NF-7 | All npm installs go through `npm.apple.com`; never the public registry. Missing packages are ingested through Apple's process or replaced |
| NF-8 | All kickoffs render in `Europe/London` regardless of where the server runs (Vercel functions are UTC by default) |

## 6. Out of scope (for v1)

- Multi-tournament support (one WC, one season, hardcoded acceptable)
- Mobile native apps (mobile-responsive web is enough)
- Push notifications / SMS
- Real-money payments
- Multi-admin
- SSO / OAuth providers
- Joker ("double-down") picks — built but hidden, slated for re-introduction once the v1 picks UI has been bedded in
- Group-winner picks — removed from v1 to keep bonuses to a manageable count

## 7. Deferred work (timed)

- **Footballer player typeahead** — the Top Scorer and First Goal Scorer bonus pickers currently take free-text. Once FIFA squad lists are finalized (≈ early June 2026, ~7 days before opening match), import them into a `tournament_players` table and swap the inputs for a proper select. Existing free-text picks should resolve by exact name match; admin script reconciles any mismatches. Source: api-football.com or FIFA's official squad page.

## 8. Companion docs

- [`wc2026-tournament.md`](./wc2026-tournament.md) — fixtures, groups, knockout structure, API source
- [`game-design.md`](./game-design.md) — bonus rules, point values, edge cases, picks UX flow
- [`tech-stack.md`](./tech-stack.md) — chosen libraries, project layout, deployment, UI direction
- [`SIMULATION.md`](./SIMULATION.md) — local tournament simulator walkthrough

