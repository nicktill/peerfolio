# Peerfolio product analysis and backlog

Scope of review: the Next.js app in `apps/web` (pages, API routes, schema, migrations 0000-0024, `lib/fantasy*.ts`, fantasy and league components, the nightly cron). Fantasy was read line by line; portfolio, Board, News, X-Ray, Wealth Lab and follows were reviewed at route and data-model level only. The AI assistant, Sports tab and iOS app are out of scope. No usage analytics were available, so "underused" is inferred from how the code connects features.

## The core weakness
A friend group joins a Fantasy league, picks stocks, and sees one long cumulative number. There is no reason to return on a particular day and no moment where someone wins. Bragging rights need discrete, repeatable contests: a winner, a loser, a story and a rematch.

## Weak, confusing, slow or underused

### Retention
- No rounds, seasons or winners. A finished league is a dead end; running it back means a new league, a new code and everyone re-joining. All-time leagues never produce a winner.
- Cumulative return makes early leaders unassailable, so trailing players stop opening the app.
- Fantasy needs active trading (live prices, market hours, queued orders); there was no low-effort weekly way to play.
- No recap or shareable result. The existing OG image (`/invite-preview/[kind]`) is a static invite mock.
- No notifications model: nothing is recorded that push or email could send later.
- Trades have no "why", and reactions attach to people, not decisions.
- No trophies, head-to-head history or accumulating identity.

### Confusing UX
- `/fantasy` list computed `yourRank` but never showed it; the empty state was one sentence and an icon.
- League creation never explained what happens at the end.
- "Matching returns to 0.01% share a rank" is cryptic; the race chart's "100" baseline is unexplained.
- The join page did not say how the league plays.
- Leagues (real, percent only) and Fantasy (play money) are weakly signposted.
- No activity indicator on the list ("round closes in 2d").

### Performance
- `loadFantasyLeague` reads every snapshot row for every member, unbounded, on each 60s poll, and triggers price refresh and order fills on every request (about 4,400 rows per poll for 12 members with a year of data). Not changed: shared hot path.
- `listFantasyLeaguesForUser` loads all members and positions of all leagues: O(leagues x members x positions) per view.
- Cron runs once a day (22:30 UTC) inside a 300s budget after all Plaid syncs. Time-sensitive work such as a draft lock cannot rely on it, so the season engine locks and settles lazily on first access, with cron as the backstop.

### Hygiene
- `npm run lint` was red on main (3 `react/no-unescaped-entities` warnings with `--max-warnings 0`).
- The stale-price refresh only looked at holdings and fantasy positions, so a ticker held only as a draft pick would never reprice.

### Underused (inferred)
- Reactions exist only on standings rows. Follows, Board, X-Ray and Wealth Lab are disconnected from the friend-group loop. `benchmark_prices` is unused by Fantasy.

## Quick wins
| # | Win | Effort | Status |
|---|-----|--------|--------|
| Q1 | Fix the 3 lint warnings | XS | Done |
| Q2 | Show rank on the fantasy list (hidden when everyone is level) | XS | Done |
| Q3 | Better empty state: how the game works in three lines | S | Done |
| Q4 | Join page says how the league plays | S | Done |
| Q5 | Bound the snapshot query in `loadFantasyLeague` | S | Backlog |
| Q6 | Round countdown on the list and a season strip on the league page | S | Done |
| Q7 | Benchmark line in the race chart | M | Backlog |
| Q8 | Cache `listFantasyLeaguesForUser` for 30s | S | Backlog |

## Prioritised backlog
1. Fantasy seasons and weekly rounds (impact very high, effort L). Done.
2. Weekly stock draft mode (high, M). Done.
3. Weekly recap with a percentage-only share image (high, M). Done.
4. "Why I picked this" notes with replies and reactions (medium-high, M). Done.
5. Push/email delivery for `fantasy_events` (very high, M-L; needs a provider, the iOS app is in flight).
6. Cross-league achievements: profile trophy shelf, streaks (medium, M).
7. Benchmark challenge round, "beat SPY this week" (medium, S; data in `benchmark_prices`).
8. Exclusive snake draft, each stock owned once (medium, L; needs real-time turns).
9. Seasons and recaps for real-portfolio Leagues (high, M; privacy review, percent only is already the engine's assumption).
10. Perf pass on league load and list (low directly, S-M).
11. Onboarding checklist: create, invite, first pick (medium, S-M).
12. Public season hall of fame page (low-medium, M).

## Design decisions
- Rounds are UTC calendar weeks (Monday 00:00 to next Monday 00:00). All schedule maths lives in one pure module (`lib/fantasy-season.ts`).
- Trading rounds are scored from nightly snapshots (last before the round vs last inside it). Only players in the league when the round began are ranked.
- Draft rounds score equal-weight picks from the last final close before the lock to the round's last close. Same ticker means same entry and exit for everyone, so submit time never matters. A round waits for its final-day exits, then settles after a 2-day grace on what exists, flagged late.
- Seasons use points (field size - rank + 1, ties split), so a rematch needs no portfolio reset, which would break the ledger integrity check.
- Additive only. A league that never turned rounds on has no season row and looks and works exactly as before; its owner opts in from a "Weekly rounds" button. New leagues get a season at creation.
- Public recap links are percentages and first names only, with no tickers, resolve names live ("A former member" for departed users), and can be switched off by the owner, which replaces the token.
