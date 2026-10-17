# Sports picks: status

Branch: `feat/sports-picks`. Flag: `NEXT_PUBLIC_SPORTS_ENABLED=1` (default off).

## Review round 1 fixes (all in this branch)

Stale-line window (publish within 24 h, lock 2 h, freeze on movement), start-time sync, results matching by name and time with learned aliases, independent-source quorum, void quorum, finite-score checks, void-vs-pick row lock plus sweep, member-limit lock, uniform join error + limiter, constant-time cron secret, quote timestamps, `picked` by market id, mirrored-pick report, settled-pick notification outbox, tennis totals off by default (`SPORTS_TENNIS_TOTALS=1`), dynamic import of the sports UI, tablist semantics, pick history with game/market/side/stake/payout, sport filter, win-per-100 on each line, lock times, locked-picks reveal, phone pick sheet. Covered by `fixes.test.ts` and `review.test.ts`.

## Done

- Provider investigation and combined free-tier budget math: PROVIDERS.md
- Fairness design, threat model, data model, phased plan: DESIGN.md
- Local test guide: TESTING.md
- Migration `0026_sports_picks.sql` (8 new tables), `0027_sports_guards.sql` (outbox, freeze and alias columns) and `0028_sports_rate_limits.sql` (all additive; `migration-safety` passes)
- Pure logic with tests (`apps/web/src/lib/sports`): odds maths, consensus + devig, line publishing, pick lock, caps, accepted-line snapshot, result resolution, grading (moneyline, spread, total, props), idempotent settlement planning, credit budgeting, provider composite (failover, merge, pacing, cache)
- Providers: mock; The Odds API adapter (also reusable for Odds-API-compatible vendors via name + base URL)
- DB layer (`store.ts`): leagues, join, atomic pick placement, publishing, locking, void, settlement
- Routes: `/api/sports/leagues`, `/join`, `/[id]`, `/[id]/picks`, `/api/sports/admin/void`, `/api/cron/sports/publish|settle`
- UI: Stocks | Sports switch (remembered), Sports home (list / create / join), league page (lines, slip, standings, history), on the existing `fw-*` design tokens
- Local scripts: `npm run sports:seed`, `npm run sports:settle-demo`
- Verified locally against a real Postgres 16: migration applies, seed + settle work, second settle pays nothing, ledger sum equals credits, pick API returns 201/200 (replay)/409 (second pick, stale price)/403 (cron without secret); `/fantasy` and the league page respond 200.

## Before enabling (checklist)

1. **Second independent results source.** Today nothing settles unless `SPORTS_MIN_RESULT_SOURCES=1` (a knowing downgrade), because only the Odds API family is wired. Add ESPN, SportsGameOdds or similar, in a different family.
2. **Publish cron frequent enough for freeze checks.** The freeze guard runs inside the publish job, so run it every 10 to 15 minutes on game days (credits permitting; the composite paces itself) and settle every 30 minutes. A published line is only as guarded as this schedule.
3. **Live Odds API key test**: props on the free plan, `/scores` shape and tennis score semantics, credit cost per call (PROVIDERS.md checklist).
4. **Display-terms confirmation** in writing from every odds vendor used.
5. **Provider-outage policy**: if odds sources fail, nothing publishes and nothing freezes (by design); if results sources fail, nothing settles or voids until one answers; picks wait. Decide who watches the `settlement_review` / `review_timeout` notifications and the cron logs.
6. Review the defaults below and the compliance note.

## Unverified (read this)

- **Every provider fact** in PROVIDERS.md: no provider site was reachable (DNS blocked), only search snippets. The Odds API free tier was not resolved with certainty; the best evidence says free is limited by credits, not by market type, and that props work per event.
- **The Odds API adapter**: response shapes follow the public v4 docs from memory; covered by a fixture test only. Tennis home/away naming, the `/scores` payload and tennis score semantics (sets vs games) are unconfirmed.
- Odds-API-compatible vendor reuse (PropLine) is a claim from a directory listing.
- **Visually checked** with Playwright screenshots in light and dark at 1280px and 375px (home, league, slip, settled history). Not checked: other viewport sizes, the create form, keyboard-only flow in a real screen reader.
- Results: only the odds vendors' own score endpoints are wired. DESIGN.md wants two independent sources; until a second exists, settlement waits forever unless `SPORTS_MIN_RESULT_SOURCES=1` is set (a knowing downgrade). Player-prop box scores have no source yet (props void if stats are missing).
- Load behaviour at scale, and concurrency under real traffic (the row lock approach is standard but untested beyond the unit and smoke tests).
- Two pre-existing lint warnings in files this branch does not touch (`admin/syncs/page.tsx`, `invite-preview/[kind]/route.tsx`) make `npm run lint` exit non-zero on the base branch as well.

## Environment variables

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SPORTS_ENABLED` | `1` enables the Sports UI and API (build-time for the client) |
| `THE_ODDS_API_KEY` | The Odds API key (server only, never committed) |
| `THE_ODDS_API_MONTHLY_CREDITS` | Plan size for pacing, default 500 |
| `PROPLINE_API_KEY`, `PROPLINE_BASE_URL`, `PROPLINE_MONTHLY_CREDITS` | Optional second, Odds-API-compatible source |
| `SPORTS_PROPS_ENABLED` | `1` to fetch player props (costs more credits) |
| `SPORTS_MIN_RESULT_SOURCES` | Override the 2-source settlement rule (default 2) |
| `SPORTS_TENNIS_TOTALS` | `1` offers tennis total games (needs confirmed score semantics first) |
| `SPORTS_MOCK` | `1` uses the offline mock for odds and results (local/dev only) |
| `CRON_SECRET` | Already used by other crons; also guards sports cron and admin void |

## Owner decisions / needs

1. **API key**: create a free key at the-odds-api.com, set `THE_ODDS_API_KEY`, and run the verification checklist at the bottom of PROVIDERS.md (props on free? `/scores` shape? terms for showing derived odds).
2. **Terms of use**: get written confirmation that displaying derived contest lines in a consumer app is allowed.
3. **Second results source**: ESPN unofficial JSON (free, no ToS), SportsGameOdds, or BALLDONTLIE (about $40/month per sport for stats). Needed for safe auto-settlement and prop grading.
4. **Cron schedule**: not added to `vercel.json` on purpose (would start spending credits on deploy). Suggested once keys exist: publish daily at 15:00 UTC and 2 hours before typical kickoffs on game days; settle every 30 minutes on game days.
5. **Compliance**: credits-only is the design. Any prize, sponsorship or paid tier needs legal review (sweepstakes/gambling rules vary by state) before it is built.
6. **Defaults to confirm**: margin 2% (`HOUSE_MARGIN`), locks 2 h before start, freeze at 1 point or 4 points of probability, caps (10 min stake, 10% max stake, 20 open picks, 60% exposure), settle delay 6 h, 48 h postponement void.
7. **Naming/copy** on the Sports screens, and the collusion report priority (Phase 2).
