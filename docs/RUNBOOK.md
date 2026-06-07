# Operations Runbook

Recipes for running LeWorldCup 2026 in production. Anything you'd need to do mid-tournament when something is on fire — keep it here, not in a Slack DM.

> All `psql` commands assume `POSTGRES_URL` is exported and points at **production** (Neon non-pooled URL). Don't run anything in this doc against the pooled URL.

---

## Reset a player's password manually

The "Forgot password?" UI is intentionally disabled (we don't run a Resend
account). When a friend forgets their password, do it by hand.

```sh
# 1. Generate a new scrypt hash
pnpm admin:hash 'their-new-password'
# copy the scrypt$... output

# 2. Apply it (find them by email or display_name first)
psql "$POSTGRES_URL" -c "SELECT id, display_name, email FROM players WHERE email = 'friend@example.com';"

psql "$POSTGRES_URL" -c "UPDATE players SET password_hash = 'scrypt$...PASTE...' WHERE email = 'friend@example.com';"

# 3. Tell them the new password (WhatsApp). They have no UI to change it themselves
# — pick something memorable, or rotate again next time they forget.
```

---

## Remove a player

Cascade takes their predictions, bonus picks, and jokers automatically.

```sh
# 1. Backup first
POSTGRES_URL="$POSTGRES_URL" pnpm db:backup

# 2. Find them
psql "$POSTGRES_URL" -c "SELECT id, display_name, email FROM players WHERE display_name = 'Eddie_test';"

# 3. Delete
psql "$POSTGRES_URL" -c "DELETE FROM players WHERE id = <id>;"

# 4. Optional: scrub their audit-log trail (rows reference them as text, not FK)
psql "$POSTGRES_URL" -c "DELETE FROM audit_log WHERE actor = 'player:<id>';"
```

---

## Rotate the invite code

No DB change. Existing logins survive.

1. Vercel → Settings → Environment Variables → edit `INVITE_CODE` → save (Production + Preview + Development).
2. Redeploy (Deployments → ⋯ → Redeploy).
3. Update `.env.local` to match.
4. Tell friends the new code.

---

## Force a results sync

Bypasses the daily cron. Two ways:

```sh
# Option A: admin UI (preferred)
# /admin/dashboard → "Sync now" button.

# Option B: curl with the bearer
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-prod-url>/api/cron/sync-results
```

Both bust the `live-leaders` cache so the "Currently leading" chips on `/bonuses` refresh on next page load.

---

## Override a match score

When football-data.org disagrees with reality:

1. Log in to `/admin` with the password you set in `ADMIN_PASSWORD_HASH`.
2. `/admin/matches` → find the match → enter scores → confirm in the dialog.
3. The row is now `admin_overridden = true`; cron won't clobber it.
4. To revert (e.g. you fat-fingered): same UI, click "Clear override" — that nulls scores and unflags the row, so the next cron sync repopulates from football-data.

---

## Resolve bonuses

After the FINAL has been played:

1. `/admin/bonuses`.
2. For each bonus, set the resolved winner(s). Joint winners → add multiple chips. Player bonuses (Golden Boot / Most Assists) snap to the squad-list canonical names.
3. Reload `/bonuses` and `/leaderboard` — bonus payouts apply on next render.

The "Currently leading" chips on `/bonuses` only flip to "Winner: …" once the FINAL row's status is `FINISHED`. Resolutions you set earlier are still respected, just hidden until then.

---

## Backups

```sh
# Full JSON dump including picks (excludes password hashes)
POSTGRES_URL="$POSTGRES_URL" pnpm db:backup
# → backups/leworldcup-<stamp>.json (gitignored)
```

For schema-changing migrations, also take a Neon branch from the dashboard before applying — instant rollback path.

---

## Migrations on prod

```sh
# 1. Check current state
psql "$POSTGRES_URL" -c "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5;"

# 2. Apply
POSTGRES_URL="$POSTGRES_URL" pnpm db:migrate

# 3. Verify by inspecting affected tables
psql "$POSTGRES_URL" -c "\d <table>"
```

If a migration fails partway: `IF NOT EXISTS` guards in our migration files mean re-running is safe. For destructive cases, restore from the Neon branch you took.

---

## Set / refresh team Pots (Pot 1 marker)

Required for the Dark Horse and Mighty Fallen pickers to filter correctly. Re-run after any cron sync that recreates teams (rare):

```sh
POSTGRES_URL="$POSTGRES_URL" pnpm tsx scripts/set-pots.ts

# Verify
psql "$POSTGRES_URL" -c "SELECT code, name FROM teams WHERE pot = 1 ORDER BY code;"
# expect 12 rows
```

---

## Refresh the squad list (Top Scorer / Most Assists typeahead)

When FIFA publishes a squad-list update:

```sh
# Replace data/SquadLists-English.pdf with the new file
pnpm tsx scripts/parse-squads.ts
# writes data/wc2026-players.json — commit this

git add data/wc2026-players.json
git commit -m "Refresh squad lists"
git push
```

Vercel auto-deploys.

---

## Re-enable email reminders / password reset

Currently disabled — `RESEND_API_KEY` is not set. To turn back on:

1. Get a Resend API key at https://resend.com (free tier: 3000/month).
2. Verify a sending domain or use the `onboarding@resend.dev` sandbox (sandbox only sends to your own verified emails).
3. Vercel env vars: set `RESEND_API_KEY` and `RESET_FROM_EMAIL`. Redeploy.
4. To also restore the "Forgot password?" link on `/`, un-comment it in `app/_components/auth-form.tsx`.

The cron route already calls `sendPickReminders()` — it no-ops while RESEND is unset, so flipping the env var alone re-enables both flows.

---

## Diagnostic commands

```sh
# Latest cron sync
psql "$POSTGRES_URL" -c "SELECT created_at, action, detail FROM audit_log WHERE action = 'sync-results' ORDER BY id DESC LIMIT 5;"

# Pending picks per player (matches in next 24h with no prediction)
# (handy for nagging friends manually since reminders are off)
psql "$POSTGRES_URL" <<'SQL'
SELECT p.display_name, COUNT(*) AS missing
FROM players p
CROSS JOIN matches m
LEFT JOIN predictions pr ON pr.player_id = p.id AND pr.match_id = m.id
WHERE m.status = 'SCHEDULED'
  AND m.kickoff > NOW() AND m.kickoff < NOW() + INTERVAL '24 hours'
  AND m.home_team_id IS NOT NULL AND m.away_team_id IS NOT NULL
  AND pr.match_id IS NULL
GROUP BY p.display_name
ORDER BY missing DESC;
SQL

# Bonus pick distribution
psql "$POSTGRES_URL" -c "SELECT kind, COUNT(*) FROM bonus_picks GROUP BY kind ORDER BY 1;"
```
