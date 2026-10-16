# Sports picks: design

Status: foundation built behind `NEXT_PUBLIC_SPORTS_ENABLED=1` (flag name in code: `sportsEnabled`).
Virtual credits only. No purchases, no cash prizes, no redemption, no cash-out, no transfers
between users. Existing Fantasy stock leagues, invite links and data are untouched: all sports
tables are new and reference only `users`.

## Product shape

- Fantasy page gets a top segmented control **Stocks | Sports**. Stocks is the default and the only
  option when the flag is off, so existing users see no change. The last choice is remembered in
  `localStorage` (`pf.fantasy.mode`), guarded for blocked storage.
- A **sports league** is a group (invite code, member limit 50, optional end date) in which everyone
  starts with the same credits (500 / 1,000 / 5,000) and makes pregame picks on NFL, NBA and tennis.
  Standing = credits + stake still riding on open picks.
- Markets: moneyline, spread, total (game points; tennis total games), and player props (NFL, NBA).
  Tennis has no props. No parlays, no live betting, no in-play edits.

## Fairness design

**Fixed contest lines.** A cron job fetches one provider snapshot (cached, budgeted, merged across
providers), computes a consensus line, and publishes it once. A published line is immutable and
identical for every user and every league. Users never trigger a provider call. A user cannot get a
better price by timing, by refreshing, or by picking a league.

**Consensus, not any single book.** For each two-way market: devig each book, drop books further
than 6 points of probability from the median, require at least 3 agreeing books at the same point,
take the median fair probability, then price the contest with one fixed margin (4.5%, about
-110/-110). Lopsided markets (a side under 10% fair) are not offered. If fewer than 3 books agree
the market is simply not published: no line beats an inaccurate line. Prices round to the nearest 5.

**Early lock.** Games lock 30 minutes before start, props 60 minutes (lineup news lands pregame).
`acceptPick` checks the lock against **server time** (`now` is passed in; the client clock is never
read). A cron also flips due markets `open -> locked` for bookkeeping, but the time check is the
guard, so a missed cron cannot let a late pick through.

**Void on news.** `voidMarket` (operator route `POST /api/sports/admin/void`, CRON_SECRET bearer)
voids one market and refunds every open pick on it, idempotently. A void on injury/lineup news is
manual in Phase 1. Phase 2 adds an automatic trigger: if the provider's line for a published market
moves more than a threshold (default 1.5 points or 8 points of probability) before lock, void and
republish as a new market. Postponed games void after 48 hours without a final. Retirements and
walkovers (tennis) void.

**Caps.** Per pick: min 10 credits, max 10% of starting credits. Per member: 20 open picks, at most
60% of starting credits at risk across open picks, one pick per market (no hedging both sides), and
no single pick may win more than 50% of starting credits. Stakes are whole credits.

**Server timestamps, snapshot on pick.** `accepted_at` is set from server time. The pick stores the
accepted `price`, `point` and the fixed `total_return` (floored to whole credits). Grading and
payout read only the snapshot. The client sends the price/point it saw; if it differs from the
published line the pick is refused, never silently re-priced.

**Atomic reservation.** `placeSportsPick` runs in one transaction: lock the member row
(`SELECT ... FOR UPDATE`), re-validate everything against the locked balance, insert the pick, insert
the `place` ledger row, decrement credits. Stake leaves the balance at acceptance (reservation). A
CHECK constraint keeps credits non-negative as a last guard. `request_id` is unique per member, so
a double tap or retry returns the original pick.

**Idempotent settlement.** `applySettlement` moves a pick out of `open` with a conditional update and
only credits if that update changed a row; the ledger row has a unique `idempotency_key`
(`pick:{id}:settle`) with `ON CONFLICT DO NOTHING`. Running settlement twice, concurrently or after
a crash, pays once. Verified: ledger sums equal member credits after repeated runs.

**Separate results source.** Prices come from the odds composite; results come from
`ResultsProvider`s. A game settles only when `minSources` (default 2) independent sources report
the same final score, after a settle delay (default 6 h) from the first final seen. Disagreement
goes to `review` (nothing settles). Stat corrections after settlement are ignored by policy:
settlement is final. Ties/pushes (NFL tie, a spread or total landing on the number) refund the
stake. A prop whose player is missing from the box score voids (DNP).

## Threat model

| Threat | How it would work | Mitigation |
|---|---|---|
| Stale-line arbitrage | Compare our fixed line to live books, bet the one that moved | Early lock (30/60 min) removes most movement; stake and win caps bound the gain; void-on-move in Phase 2; credits have no cash value |
| Free-money lines | We publish a mispriced line from a bad feed | Consensus of 3+ books, outlier drop, margin baked into every price, lopsided markets skipped, snapshot freshness check (10 min) |
| Late-edit / late-pick | Pick after kickoff or edit a pick after seeing news | No edit or cancel exists; server-time lock; snapshot of accepted line; one pick per market |
| Double-spend / race | Fire parallel pick requests to exceed balance or caps | Member row lock, re-check inside the transaction, CHECK credits >= 0, unique (member, market) |
| Replay / double submit | Retry a request | `request_id` idempotency |
| Multi-account collusion | One person runs many accounts, funnels credits to a main account via opposite picks | No transfers; no cash prizes so low incentive; each account starts equal; same-market opposite sides can be detected (Phase 2 report: pairs of members in one league with mirrored picks); member limit 50; leagues are invite-only |
| Settlement manipulation | Corrupt a result feed to flip outcomes | Two agreeing independent sources, settle delay, `review` state, admin void |
| Provider outage | No data, stale data | Failover across providers; empty snapshot publishes nothing; stale snapshot rejected |
| Cost exhaustion | Traffic burns provider quota | Users never call providers; per-provider credit pacing (`sports_provider_usage`) |
| Real-money drift | Credits used as value | No purchase path, no redemption, copy says "play credits", compliance review before any prizes (STATUS.md) |

## Data model

All new, additive (migration `0025_sports_picks.sql`):

- `sports_leagues` (name, emoji, accent, owner, invite code, `sports[]`, starting credits, ends at, member limit)
- `sports_members` (league, user, `credits` >= 0)
- `sports_events` (sport, external id, home/away, starts at, status, scores, `final_first_seen_at`) global
- `sports_markets` (event, `market_key`, kind, player, stat key, status, `lock_at`, books used, void reason) global
- `sports_lines` (market, selection, price, point) global, immutable
- `sports_picks` (league, member, market, line, selection, stake, price/point snapshot, `total_return`, status, `request_id`, accepted/settled at)
- `sports_ledger` (member, pick, type `grant|place|settle_win|settle_refund`, signed amount, unique `idempotency_key`)
- `sports_provider_usage` (provider, UTC day, credits) for budget pacing

Invariant: `sports_members.credits == sum(sports_ledger.amount)` per member.

## State machines

- Market: `open -> locked -> settled`, and `open|locked -> void`.
- Event: `scheduled -> final | void` (postponed/cancelled become `void` after the grace period).
- Pick: `open -> won | lost | push | void`. Terminal; no edits.

## Provider layer (`apps/web/src/lib/sports`)

Same pattern as stock quotes (`composite-provider.ts`, `provider-budget.ts`), adapted to quota-metered
sources. See PROVIDERS.md for the budget math.

- `OddsProvider` / `ResultsProvider` interfaces (`types.ts`); `MockProvider`; `TheOddsApiProvider`
  (also usable for Odds-API-compatible vendors via name + base URL).
- `createCompositeOdds`: ordered sources; a later source is queried only if markets are thin
  (fewer than 3 books) or the earlier source failed or was skipped. Answers are **merged** (union
  of books, de-duplicated per book id, home/away re-oriented) so stacked free tiers improve the
  consensus rather than only filling gaps.
- `credit-budget.ts`: monthly cap x safety 0.9, paced daily with a 2x burst; usage recorded in
  `sports_provider_usage`. A source over pace is skipped, not failed.
- `withSnapshotCache`: in-memory TTL (5 min) with stale-if-empty.
- Failover: a throwing source is logged in `snapshot.notes` and the next one is used.

## API routes (all 404 when the flag is off)

- `GET|POST /api/sports/leagues`; `POST /api/sports/leagues/join`
- `GET /api/sports/leagues/[id]` (standings, open markets with lines, my picks, limits)
- `POST /api/sports/leagues/[id]/picks` (`lineId, stake, expectedPrice, expectedPoint, requestId`)
- `GET /api/cron/sports/publish`, `GET /api/cron/sports/settle` (CRON_SECRET bearer)
- `POST /api/sports/admin/void` (CRON_SECRET bearer)

## Screens

Stocks | Sports switch on `/fantasy` (reuses the sliding-pill pattern of the trade panel);
Sports home (league list, start, join); `/fantasy/sports/[id]` with header, three-stat scoreboard
(rank, credits, at risk), open lines grouped by day and game with tappable lines, standings, pick
slip and pick history in the rail. All built on the existing `fw-*` tokens and components.

## Phased plan

1. **Foundation (this branch)**: schema, pure logic, mock + The Odds API adapter, composite, routes, UI behind the flag.
2. Real keys in staging; verify provider facts (PROVIDERS.md checklist); add second results source (ESPN or SportsGameOdds); line-move auto-void; settlement admin screen for `review` events; leaderboard across leagues; vercel.json crons.
3. Props at scale (box-score source), NBA/tennis tuning, notifications for settled picks.
4. Collusion report, rate limits per user, legal/compliance review before any prize or sponsor idea.
