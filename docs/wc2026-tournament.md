# FIFA World Cup 2026 — Tournament Reference

Authoritative facts for the LeWorldCup2026 pick'em app. Last updated 2026-05-15.

> **Note on sourcing.** During preparation of this document, programmatic fetches against `en.wikipedia.org`, `fifa.com`, and `football-data.org` returned HTTP 403 from the sandboxed environment. Where a fact could not be re-verified live, it is drawn from public information available up to the assistant's knowledge cutoff (Jan 2026, i.e. shortly after the Final Draw on 5 Dec 2025) and marked with the relevant source URL the engineering team should re-confirm before launch. Items genuinely uncertain are flagged **TBD**.

---

## 1. Tournament Basics

| Field | Value |
|---|---|
| Official name | FIFA World Cup 26 |
| Host nations | **Canada, Mexico, United States** (3-nation co-host, a tournament first) |
| Start date | **Thursday, 11 June 2026** — opening match at Estadio Azteca, Mexico City |
| End date | **Sunday, 19 July 2026** — Final |
| Duration | 39 days |
| Number of teams | **48** (expanded from 32) |
| Group format | **12 groups of 4** (Groups A–L) |
| Group stage advancement | Top 2 of each group + **8 best third-placed teams** advance → **32 teams** to knockouts |
| Knockout format | Round of 32 → Round of 16 → Quarter-finals → Semi-finals → Third place play-off → Final |
| Final venue | **MetLife Stadium**, East Rutherford, New Jersey, USA |
| Opening match venue | **Estadio Azteca**, Mexico City |
| Total host cities | 16 (11 USA, 3 Mexico, 2 Canada) |

Sources to re-verify at launch:
- https://en.wikipedia.org/wiki/2026_FIFA_World_Cup
- https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026

---

## 2. Knockout Rounds (UI Labels)

Use these exact strings in the UI:

| Order | Round name (UI) | Match count | Notes |
|---|---|---|---|
| 1 | **Round of 32** | 16 | New round introduced for the 48-team format |
| 2 | **Round of 16** | 8 | |
| 3 | **Quarter-finals** | 4 | Hyphenated, lower-case "f" |
| 4 | **Semi-finals** | 2 | Hyphenated, lower-case "f" |
| 5 | **Third place play-off** | 1 | Losers of the two semi-finals |
| 6 | **Final** | 1 | At MetLife Stadium |

Total knockout matches: **32**.

(source: https://en.wikipedia.org/wiki/2026_FIFA_World_Cup — re-verify)

---

## 3. Total Match Count

| Stage | Matches | Calculation |
|---|---|---|
| Group stage | **72** | 12 groups × 6 matches per group (4 teams → C(4,2) = 6) |
| Round of 32 | 16 | |
| Round of 16 | 8 | |
| Quarter-finals | 4 | |
| Semi-finals | 2 | |
| Third place play-off | 1 | |
| Final | 1 | |
| **Total** | **104** | |

(source: https://en.wikipedia.org/wiki/2026_FIFA_World_Cup)

---

## 4. Groups (Final Draw — 5 December 2025, Kennedy Center, Washington DC)

> **VERIFICATION REQUIRED.** Live web access was unavailable during authoring. The four pots and the three host slots (Canada, Mexico, USA) were fixed pre-draw, and the slots below reflect publicly reported draw results plus playoff placeholders. Engineering MUST re-confirm against `https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_group_stage` before any user-facing release. Any team listed as a UEFA play-off (PO) or Inter-confederation play-off (IPO) winner is **TBD** until those play-offs complete in **late March 2026** — note: those play-offs concluded before today's date (2026-05-15), so the actual qualifier names should be substituted in.

Two host nations were pre-seeded:
- **Mexico → Group A, position A1** (host of opening match)
- **Canada → Group B, position B1**
- **USA → Group D, position D1**

| Group | Pos 1 | Pos 2 | Pos 3 | Pos 4 |
|---|---|---|---|---|
| **A** | Mexico (host) | **TBD** | **TBD** | **TBD** |
| **B** | Canada (host) | **TBD** | **TBD** | **TBD** |
| **C** | **TBD** | **TBD** | **TBD** | **TBD** |
| **D** | USA (host) | **TBD** | **TBD** | **TBD** |
| **E** | **TBD** | **TBD** | **TBD** | **TBD** |
| **F** | **TBD** | **TBD** | **TBD** | **TBD** |
| **G** | **TBD** | **TBD** | **TBD** | **TBD** |
| **H** | **TBD** | **TBD** | **TBD** | **TBD** |
| **I** | **TBD** | **TBD** | **TBD** | **TBD** |
| **J** | **TBD** | **TBD** | **TBD** | **TBD** |
| **K** | **TBD** | **TBD** | **TBD** | **TBD** |
| **L** | **TBD** | **TBD** | **TBD** | **TBD** |

**Action for engineering:** Pull the canonical group list from football-data.org `/v4/competitions/WC/standings` after the competition is loaded, or scrape Wikipedia's group-stage page once at app build/seed time. Do not hard-code without re-verification.

(source: https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_Final_Draw — re-verify)

---

## 5. External Data Source Recommendation

### Primary: football-data.org (free tier)

- Base URL: `https://api.football-data.org/v4/`
- Competition code for the World Cup: **`WC`**
- Auth: free API token via `X-Auth-Token` header (sign up at football-data.org)
- Free tier rate limit: **10 requests / minute** (HTTP 429 on overflow)
- Free tier competition coverage historically includes `WC`, `EC`, `CL`, plus the top European leagues. **Re-verify** that `WC` 2026 is on the free tier at competition kickoff — past tournaments (2018, 2022) were included.

Useful endpoints (all GET):

| Endpoint | Purpose |
|---|---|
| `/v4/competitions/WC` | Competition metadata |
| `/v4/competitions/WC/teams` | All 48 participating teams |
| `/v4/competitions/WC/matches` | All fixtures + live scores + status |
| `/v4/competitions/WC/matches?stage=GROUP_STAGE` | Filter by stage |
| `/v4/competitions/WC/standings` | Group standings (after group stage starts) |
| `/v4/competitions/WC/scorers` | Top scorers — **NOT on the free tier historically** |
| `/v4/matches/{id}` | Single match incl. goals timeline |

Match `status` values: `SCHEDULED`, `TIMED`, `IN_PLAY`, `PAUSED`, `FINISHED`, `POSTPONED`, `SUSPENDED`, `CANCELLED`.
Stage names returned: `GROUP_STAGE`, `LAST_32`, `LAST_16`, `QUARTER_FINALS`, `SEMI_FINALS`, `THIRD_PLACE`, `FINAL`. Map these to the UI labels in §2.

(source: https://www.football-data.org/coverage and https://docs.football-data.org/ — re-verify)

### Fallback / supplement for top-scorer data: API-Football (api-football.com, RapidAPI or direct)

- Base URL: `https://v3.football.api-sports.io/`
- Free tier: **100 requests / day**, all endpoints (incl. `/players/topscorers`, `/fixtures`, `/standings`)
- World Cup 2026 league ID: **TBD** (typically `1` for World Cup historically — confirm via `/leagues?search=world%20cup` once the tournament is registered)
- Pros: top scorers, assists, lineups, events all on free tier.
- Cons: 100/day cap is tight; cache aggressively (e.g. fetch top-scorers once an hour at most).

(source: https://www.api-football.com/pricing — re-verify)

### Recommendation

Use **football-data.org** as the system of record for fixtures, scores, and group standings (10 req/min is plenty with sane caching). Use **API-Football** *only* for the top-scorer leaderboard, polled hourly during match days and cached. This keeps us inside both free tiers.

---

## 6. Group-Stage Tie-breakers (FIFA Official Order)

When two or more teams in a group finish on equal **points**, ranking is decided by, in this exact order:

1. **Goal difference** in all group matches.
2. **Goals scored** in all group matches.
3. **Points** obtained in head-to-head matches between the tied teams.
4. **Goal difference** in head-to-head matches between the tied teams.
5. **Goals scored** in head-to-head matches between the tied teams.
6. **Fair-play points** across the group stage (sliding scale: yellow card = −1, indirect red (2nd yellow) = −3, direct red = −4, yellow + direct red = −5).
7. **Drawing of lots** by the FIFA Organising Committee.

If, after step 2, only some of the tied teams remain separated, steps 3–5 are re-applied to whichever subset remains tied.

### Determining the 8 best third-placed teams

The 12 third-placed teams are ranked using the same criteria above (points → GD → goals scored → fair play → lots), since they did not all play each other; head-to-head is therefore not used in this cross-group ranking. The top 8 advance to the Round of 32; the bottom 4 are eliminated.

(source: https://digitalhub.fifa.com/m/ — Regulations FIFA World Cup 26, Article on group-stage rankings — re-verify against the published 2026 regulations PDF)

---

## 7. Open Items / TBD Summary

- [ ] **Final Draw groups (§4)** — re-confirm all 48 team placements from Wikipedia or FIFA once live web access is restored.
- [ ] **football-data.org free-tier `WC` coverage** — confirm pre-launch by hitting `/v4/competitions/WC` with a free token.
- [ ] **API-Football WC league ID** — discover via `/leagues` once tournament is registered.
- [ ] **2026 official tie-breaker regulations** — pull the latest PDF from FIFA's digital hub and confirm the order above is unchanged from 2022; in particular confirm fair-play card values.
- [ ] **Match kick-off time zones** — fixtures span 4 time zones (PT/MT/CT/ET in NA, plus Mexico/Canada local). Decide app-side display strategy.
