# LeWorldCup2026 — Tech Stack & Design Direction

Status: **Final**. Scaffold against this; do not relitigate choices.
Audience: ~12 friends running a private FIFA World Cup 2026 pick'em.

---

## 1. Stack summary

| Concern              | Choice                                       | Rationale                                                                  | Docs                                                              |
| -------------------- | -------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Hosting              | Vercel (Hobby / free)                        | Zero-config Next.js, free tier covers 12 users easily                      | https://vercel.com/docs                                           |
| Framework            | Next.js (latest stable, App Router) + TS     | Server Components keep client JS tiny, Server Actions remove API boilerplate | https://nextjs.org/docs                                           |
| Database             | Vercel Postgres (Neon)                       | Free 0.5 GB, branching + PITR, native Vercel integration                   | https://vercel.com/docs/storage/vercel-postgres                   |
| ORM / migrations     | Drizzle ORM + `drizzle-kit`                  | Lightweight, SQL-first, no codegen daemon, ~0 runtime overhead             | https://orm.drizzle.team                                          |
| Styling              | Tailwind CSS v4                              | Utility-first, no runtime, plays nicely with RSC                           | https://tailwindcss.com/docs                                      |
| UI primitives        | shadcn/ui (selective: Button, Dialog, Table) | Copy-paste components, no library lock-in, tweakable                       | https://ui.shadcn.com                                             |
| Auth                 | Roll-our-own: invite code + email + scrypt password   | 12 friends; no need for OAuth/NextAuth surface area                        | n/a                                                               |
| Cookies / signing    | `jose` (HS256 JWT in HttpOnly cookie)        | Standard, audited, tiny                                                    | https://github.com/panva/jose                                     |
| Password hashing     | Node built-in `crypto.scrypt`                | No external dep; format `scrypt$N$saltHex$hashHex` with bumpable cost      | https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback |
| Email (optional)     | Resend HTTP API                              | Free tier 3000/mo; only used for `/forgot` password reset; degrades cleanly if unset | https://resend.com/docs                                  |
| Cron                 | Vercel Cron `*/30 * * * *` (tournament window) | Free on Hobby, native, secured via `CRON_SECRET` header                    | https://vercel.com/docs/cron-jobs                                 |
| Football data        | football-data.org free tier                  | Free 10 req/min, World Cup competition `WC` covered                        | https://www.football-data.org/documentation/api                   |
| Validation           | Zod                                          | Form/server action input parsing                                           | https://zod.dev                                                   |
| Package manager      | pnpm                                         | Fast, disk-efficient, Vercel supports natively. **Installs go through `npm.apple.com` only** — never the public registry | https://pnpm.io                              |
| Testing              | Vitest                                       | Pure-function tests on the scoring engine                                  | https://vitest.dev                                                |
| Format               | Prettier (no ESLint)                         | Linting was nice-to-have on a 12-friend project; tsc + Prettier are enough | https://prettier.io                                               |
| Local DB             | Homebrew `postgresql@16`                     | One brew install, no Docker. `docker-compose.yml` kept as fallback         | https://formulae.brew.sh/formula/postgresql@16                    |

---

## 2. Project layout

```
LeWorldCup2026/
├── app/                          # Next.js App Router
│   ├── (public)/
│   │   ├── page.tsx              # Landing / login (invite code + name)
│   │   └── layout.tsx
│   ├── (authed)/
│   │   ├── layout.tsx            # Reads cookie, redirects if missing
│   │   ├── matches/
│   │   │   ├── page.tsx          # List of upcoming matches + my picks
│   │   │   └── [matchId]/page.tsx
│   │   ├── leaderboard/page.tsx
│   │   ├── rules/page.tsx
│   │   └── me/page.tsx           # My picks history
│   ├── admin/
│   │   ├── page.tsx              # Admin dashboard (separate password)
│   │   └── invites/page.tsx
│   ├── api/
│   │   └── cron/sync-results/route.ts
│   ├── actions/                  # Server Actions
│   │   ├── auth.ts
│   │   ├── picks.ts
│   │   └── admin.ts
│   ├── globals.css
│   └── layout.tsx                # Root layout, fonts
├── components/
│   ├── ui/                       # shadcn primitives
│   ├── MatchCard.tsx
│   ├── LeaderboardTable.tsx
│   ├── PickForm.tsx
│   └── Flag.tsx                  # Country flag emoji + label
├── lib/
│   ├── auth.ts                   # signCookie, verifyCookie, getSession
│   ├── scoring.ts                # Pure scoring functions (well-tested)
│   ├── football-data.ts          # API client (fetch wrapper + types)
│   ├── env.ts                    # Zod-validated process.env
│   └── utils.ts
├── db/
│   ├── schema.ts                 # Drizzle table definitions
│   ├── client.ts                 # drizzle() instance, server-only
│   ├── migrations/               # Generated by drizzle-kit
│   └── seed.ts
├── scripts/
│   ├── backup.ts                 # Nightly pg_dump → local file
│   ├── generate-invite.ts        # CLI: prints a fresh invite code
│   └── reset-local.ts
├── public/                       # Static assets (favicon, og-image)
├── docs/                         # This folder
├── docker-compose.yml
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── .env.local                    # Gitignored
```

---

## 3. Environment variables

`.env.example` (commit this; copy to `.env.local`):

```bash
# --- Database ---
# Local: docker compose default; Vercel: injected automatically by Vercel Postgres integration
POSTGRES_URL="postgres://postgres:postgres@localhost:5432/leworldcup"

# --- Auth ---
# 32+ random bytes, base64. Generate: `openssl rand -base64 48`
AUTH_SECRET="replace-me-with-openssl-rand-base64-48"

# Single shared invite code for friends. Rotate any time; old cookies stay valid.
INVITE_CODE="goal-2026"

# Admin password (separate flow at /admin). Bcrypt hash, not plaintext.
# Generate: node -e "console.log(require('bcryptjs').hashSync('mypassword', 10))"
ADMIN_PASSWORD_HASH="$2a$10$..."

# --- Cron ---
# Random token. Vercel Cron must send `Authorization: Bearer $CRON_SECRET`.
CRON_SECRET="replace-me-with-openssl-rand-hex-32"

# --- Football data ---
# Free tier from https://www.football-data.org/client/register
FOOTBALL_DATA_TOKEN="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# --- App ---
# Used for absolute URLs in OG tags etc. Vercel sets VERCEL_URL automatically.
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

`lib/env.ts` validates these with Zod at boot; missing vars fail fast.

---

## 4. Local development setup

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: leworldcup
    ports:
      - "5432:5432"
    volumes:
      - leworldcup_db:/var/lib/postgresql/data

volumes:
  leworldcup_db:
```

First-run commands:

```bash
# 1. clone + install
pnpm install

# 2. bring up DB
docker compose up -d

# 3. copy env + edit
cp .env.example .env.local

# 4. run migrations
pnpm drizzle-kit migrate

# 5. seed teams + fixtures (pulls from football-data.org)
pnpm tsx db/seed.ts

# 6. dev
pnpm dev
```

Useful scripts in `package.json`:

| Script             | Command                                |
| ------------------ | -------------------------------------- |
| `dev`              | `next dev --turbo`                     |
| `build`            | `next build`                           |
| `db:generate`      | `drizzle-kit generate`                 |
| `db:migrate`       | `drizzle-kit migrate`                  |
| `db:studio`        | `drizzle-kit studio`                   |
| `db:seed`          | `tsx db/seed.ts`                       |
| `db:backup`        | `tsx scripts/backup.ts`                |

---

## 5. Deployment

1. **Push repo to GitHub.**
2. **Import on Vercel** — pick the repo. Framework auto-detected as Next.js. Build command `pnpm build`, install command `pnpm install`.
3. **Provision Postgres** — in the Vercel dashboard: *Storage → Create → Postgres*. Attach to the project; this auto-injects `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, etc. We only use `POSTGRES_URL`.
4. **Set env vars** (Project → Settings → Environment Variables): `AUTH_SECRET`, `INVITE_CODE`, `ADMIN_PASSWORD_HASH`, `CRON_SECRET`, `FOOTBALL_DATA_TOKEN`, `NEXT_PUBLIC_APP_URL`. Mark as Production + Preview.
5. **Run migrations** on first deploy — easiest path: locally point `POSTGRES_URL` at the production DB once, run `pnpm db:migrate`. Or add a one-shot `vercel-build` hook: `drizzle-kit migrate && next build`.
6. **Configure Cron** — add `vercel.json`:

   ```json
   {
     "crons": [
       { "path": "/api/cron/sync-results", "schedule": "*/30 * * * *" }
     ]
   }
   ```

   The route handler must check `request.headers.get('authorization') === \`Bearer ${process.env.CRON_SECRET}\`` and 401 otherwise. Vercel automatically sends this header on Hobby cron invocations only when configured via environment — to be safe, also accept Vercel's built-in `x-vercel-cron` header check if available, but the bearer is the source of truth.

7. **First deploy** — push to `main`. Smoke-test login, picks, leaderboard.

---

## 6. Backup strategy

Three layers, only the first two are mandatory:

1. **Neon PITR (automatic, free).** Vercel Postgres → Neon retains 7 days of point-in-time history on the free tier. No action needed; verify in the Vercel dashboard.
2. **Neon branch before risky migrations.** `vercel postgres branch create pre-migration-YYYYMMDD` (or via Neon console). Keeps a logical snapshot you can diff.
3. **Nightly `pg_dump` to local machine** via `scripts/backup.ts` run by a launchd/cron job on the admin's laptop:

   ```bash
   pg_dump "$POSTGRES_URL" --no-owner --no-acl --format=custom \
     > "backups/leworldcup-$(date +%Y%m%d).dump"
   ```

   Stored under `~/LeWorldCup2026-backups/` and synced to iCloud Drive. We deliberately avoid Vercel Blob to stay on free tier.

Restore drill: once before the tournament starts, restore the latest dump to a fresh local Postgres and verify the leaderboard matches production. Document the steps in `docs/runbook.md` (separate doc).

---

## 7. UI design direction

**Chosen tone: Vintage Scoreboard.** Think Panini sticker album crossed with an airport flip-board: warm cream paper, deep navy ink, a hit of tournament red, and a single accent of 70s mustard for highlights. Compact tables for data-dense views (leaderboard, fixtures), roomy cards for individual matches and pick entry. Fun but legible; no skeuomorphism beyond a subtle paper texture on the body background.

### Palette

| Role               | Hex       | Usage                                              |
| ------------------ | --------- | -------------------------------------------------- |
| Paper (bg)         | `#F4ECD8` | Page background, card surface                     |
| Ink (fg)           | `#1B2A41` | Primary text, table rules                          |
| Pitch green        | `#2E6F40` | Secondary actions, "live" badges                   |
| Tournament red     | `#C03221` | CTAs, locked picks, your-row highlight             |
| Mustard            | `#E2A829` | Leader crown, achievements, hover accents          |

Dark mode (auto): invert paper → `#13161C`, ink → `#F4ECD8`, keep accents.

### Typography

- **Display / scoreboard numerals:** *DM Mono* (free, Google Fonts). Tabular figures for scores and points so columns line up.
- **Body / UI:** *Inter* (variable). 15px base, 1.45 line-height.
- **Optional flair:** *Frank Ruhl Libre* for the H1 on the landing page only — gives it a "match programme" feel without infecting the rest of the app.

### Visual motif

A 1px dashed horizontal rule (ink on paper) separating sections, echoing perforated stub tickets. Country flag emoji left, team name right, monospace score in the middle. No icons library — emoji + a handful of inline SVGs (lock, crown, clock).

### Density

- Leaderboard: compact table, 32px row height, zebra striping at 4% ink opacity.
- Match list: compact rows on desktop, stacked cards on mobile.
- Pick entry: one roomy card per match with big tap targets (min 44px).

### Wireframes

**Leaderboard (desktop, compact):**

```
┌────────────────────────────── Le World Cup 2026 ──────────────────────────────┐
│  matches   leaderboard*   rules   me                          eddie ▾  log out│
├───────────────────────────────────────────────────────────────────────────────┤
│  STANDINGS                                              after Matchday 14     │
│  ─────────────────────────────────────────────────────────────────────────    │
│   #   player              pts   exact   result   movers                       │
│   1   Eddie       👑      142    11      24       ▲ 2                          │
│   2   Sam                 138     9      26       ▼ 1                          │
│   3   Priya               135    10      23       —                           │
│   4   You         ◀       129     8      25       ▲ 3                          │
│   5   Marco               121     7      22       ▼ 1                          │
│   …                                                                            │
│  ─────────────────────────────────────────────────────────────────────────    │
│  scoring: exact = 5 · result = 2 · goal diff bonus = 1                        │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Match card (mobile, roomy):**

```
┌──────────────────────────────────────┐
│  GROUP C · MATCHDAY 2                │
│  Sat 20 Jun · 21:00 · MetLife        │
├──────────────────────────────────────┤
│                                      │
│   🇫🇷  France          [ 2 ]          │
│                                      │
│   🇲🇽  Mexico          [ 1 ]          │
│                                      │
│   - - - - - - - - - - - - - - - - -  │
│                                      │
│   your pick:  France 2 – 1 Mexico    │
│   locked  🔒  closes in 2h 14m       │
│                                      │
│   [   change pick   ]                │
│                                      │
└──────────────────────────────────────┘
```

After kickoff the score block flips to live: red dot, monospace running score, and the pick row gets a green/red/yellow stub indicating exact/result/miss.

---

## 8. Performance / cost

Sanity-check against free tier limits with our actual workload:

- **Users:** 12. Concurrent peak maybe 8 during a big match.
- **Matches:** 104 (48 group stage + 56 knockout/playoff including expanded format).
- **Picks:** 12 × 104 = 1,248 rows total. Plus ~5,000 audit-log rows. **Well under Neon's 0.5 GB.**
- **Reads:** Every page is server-rendered with short cache (`revalidate: 30`) on leaderboard. Even at 1,000 req/day we're at < 0.001% of Vercel's bandwidth allowance.
- **Cron:** `*/30 * * * *` only during the tournament window (June 11 – July 19, 2026 → ~40 days × 48 = ~1,900 invocations). Hobby allows unlimited cron invocations on simple schedules; each call hits football-data.org once and writes ≤ a few dozen rows. Within the 10 req/min API quota by a wide margin.
- **Server Action throughput:** Picks are tiny writes, gated to one per user per match. No hot path concerns.
- **Bandwidth:** No images beyond flag emoji + favicon + one OG image. Estimate < 50 MB/month transfer total. Vercel Hobby allows 100 GB.
- **Build minutes:** Next.js builds in ~60s; we're nowhere near limits.

**Verdict: comfortably free.** The only risk is football-data.org rate limiting if we accidentally call it from the request path — keep all external API calls inside the cron handler and seed script.

---

*Owner: Eddie Long. Last reviewed 2026-05-15. Update this doc — don't fork it — when choices change.*
