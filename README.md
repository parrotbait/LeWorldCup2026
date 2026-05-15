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

> Full instructions land in `docs/tech-stack.md` once the engineering team finalizes them. TL;DR:
>
> ```sh
> docker compose up -d         # local Postgres
> pnpm install
> pnpm db:migrate
> pnpm dev
> ```

## Deployment

See [`docs/tech-stack.md`](./docs/tech-stack.md) for the Vercel deployment walkthrough.

## Game rules

Player-facing rules live at `/rules` on the deployed site, sourced from [`docs/rules.md`](./docs/rules.md).
