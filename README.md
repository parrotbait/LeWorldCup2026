# LeWorldCup 2026

A small private pick'em web game for ~12 friends to play along with **FIFA World Cup 2026** (Canada / Mexico / USA, June–July 2026).

Successor to the 2022 Google Sheets game (`LeWorldCup2022.pdf`), now a real website with auto-pulled scores, transparent leaderboards, and proper bonus picks.

## Status

🚧 In active development — see [`docs/requirements.md`](./docs/requirements.md) for the living requirements doc.

## Stack (planned)

- **Framework**: Next.js (App Router) + TypeScript
- **DB**: Vercel Postgres (Neon) via Drizzle ORM
- **Hosting**: Vercel free Hobby tier
- **Score source**: [football-data.org](https://www.football-data.org/) free tier, polled by Vercel Cron
- **Auth**: shared invite code + display name (no SSO, no email)

See [`docs/tech-stack.md`](./docs/tech-stack.md) for the finalized stack and project layout.

## Local development

```sh
# 1. Postgres (Homebrew)
brew install postgresql@16          # one-time
brew services start postgresql@16   # start now + at login
createdb leworldcup                  # one-time

# 2. Install
pnpm install

# 3. Env
cp .env.example .env.local
# Fill in:
#   POSTGRES_URL=postgres://$USER@localhost:5432/leworldcup
# Generate secrets:
openssl rand -base64 48              # → AUTH_SECRET
openssl rand -hex 32                 # → CRON_SECRET
pnpm admin:hash 'your-admin-pw'      # → ADMIN_PASSWORD_HASH (paste into .env.local)
# Get a free token at https://www.football-data.org/client/register → FOOTBALL_DATA_TOKEN

# 4. Migrate + seed
pnpm db:generate     # produces migration SQL from db/schema.ts
pnpm db:migrate
pnpm db:seed

# 5. Run
pnpm dev             # http://localhost:3000

# 6. (optional) Pull live fixtures
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-results
```

> **Docker users:** `docker-compose.yml` is also provided. If you have Docker
> Compose V2 installed (`docker compose version` works), run
> `docker compose up -d` instead of the brew steps above and use the
> `postgres://postgres:postgres@…` URL.

## Deployment

See [`docs/tech-stack.md`](./docs/tech-stack.md) for the Vercel deployment walkthrough.

## What's built so far

- ✅ Auth (invite code + display name) and admin login
- ✅ Postgres schema (players, teams, matches, predictions, bonus picks, jokers, settings, audit log)
- ✅ Pure scoring engine + unit tests (`lib/scoring.ts`, `lib/scoring.test.ts`)
- ✅ Leaderboard, matches list, rules, admin dashboard pages
- ✅ Cron route + football-data.org client for results auto-sync
- ✅ Vintage Scoreboard styling (Tailwind v4 + DM Mono / Inter)

## What's next (tracked in TaskList)

- 🚧 Picks UI (per-match prediction grid with auto-save and lock countdown)
- 🚧 Bonus picks UI (winner, top scorer, group winners, dark horse, wooden spoon, first scorer)
- 🚧 Joker selection per knockout round
- 🚧 Per-player profile + per-match detail views (transparent point breakdowns)
- 🚧 Admin score override editor + bonus resolution UI
- 🚧 Visibility gating (hide other players' picks until kickoff)

## Game rules

Player-facing rules live at `/rules` on the deployed site, sourced from [`docs/rules.md`](./docs/rules.md).
