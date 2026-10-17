# Sports picks: data and pricing architecture

Date: 2026-10-17. Scope: NFL, NBA, tennis, plus MMA/UFC and boxing. Play credits only.
Tags: **[V]** verified today (I called the endpoint or read the provider's own page), **[U]** unverified
(inference, third-party, or needs a key). Nothing here used a key or signed up for anything.

## 0. Decisions in one screen

1. **Versioned quotes replace one-shot immutable lines.** A market has a current quote (version n), re-cut only when consensus moves past a threshold. Everyone sees the same version; a pick names the version it saw.
2. **A free sentinel guards every quote.** ESPN embeds DraftKings odds for NFL and fights [V], free and polled far faster than the metered Odds API. A quote is accepted if its consensus is young enough, or a fresh sentinel confirms the baseline. Silence near kickoff means "suspended".
3. **Hard lock = first of (scheduled start minus cushion, first observed non-pre state).** Cushion: 2 min team sports, 10 min per fight segment, 45 min tennis. A pick accepted after the detected start is voided.
4. **Users never trigger upstream calls.** Pollers run on a claim (`UPDATE ... SKIP LOCKED`), fired by a read (`after()`) or the 5-minute GitHub Actions heartbeat, as `claimLiveQuotes` does [V: `lib/stale-prices.ts`, `.github/workflows/prices.yml`].
5. **500 Odds API credits/month is the binding constraint.** Spend them only on multi-book prices; everything else runs on ESPN.
6. **Settlement wants two families.** NFL/NBA/tennis: yes. UFC: ESPN plus an unverified second source. Boxing: no free automated source exists [V], so an operator confirm queue.

## 1. Provider facts this design relies on

| Provider (family) | Facts | Status |
|---|---|---|
| ESPN site API `site.api.espn.com` (`espn`) | `/mma/ufc/scoreboard` returns a card with every bout, per-bout `date` (card segment time, e.g. prelims 21:00Z, main 00:00Z), `status.type.state` pre/in/post, `period`, `displayClock`, `competitors[].winner`, records, `format.regulation.periods` (3 or 5). `cache-control: max-age=1` on scoreboards, 8 s on NFL `summary`. NFL scoreboard lists DraftKings spread/total per scheduled game; `summary` carries `boxscore.players`, `winprobability` (201 points on a finished game), `injuries`. Tennis scoreboard has per-match `linescores` per set including `tiebreak`, statuses `FINAL`, `RETIRED`, `WALKOVER`, `CANCELED`, and a doubles grouping next to singles. | V |
| ESPN core API `sports.core.api.espn.com` (`espn`) | UFC `.../competitions/{id}/status` returns `result` with `name` (`kotko`, `submission`, `decision---unanimous`, `draw`) and `description` (Punches, Rear Naked Choke) plus `period` and `clock` (seconds elapsed in the round). Sampled 10 finished bouts. Caching is long here: `status` `max-age=270`, `odds` `max-age=187`, so use it for finals, never for live. `.../odds` for UFC returns one book (DraftKings) with moneyline, over/under rounds (3.5), and `victoryMethod` prices (koTkoDq, submission, points); no timestamp. Tennis has no odds [V: empty]. | V |
| ESPN boxing | Not present. `sports/boxing` is "Invalid sport"; the sports list has no boxing; the `mma/boxe` league holds one 2013 event. | V (absence) |
| ESPN terms and limits | Unofficial and undocumented; no stated rate limit or licence. Opt-in and pluggable, as `espn.ts` already treats it. | V (absence of terms) |
| The Odds API v4 (`odds-api`) | Free "Starter": 500 credits/month, all sports, most bookmakers, all markets [V home page]. Cost = markets x regions per call; `/sports` and `/events` are free, empty responses are free [V docs]. Scores: live ~30 s, `daysFrom` 1-3 costs 2, otherwise 1 [V]. Keys `mma_mixed_martial_arts` and `boxing_boxing` exist [V]. Docs say MMA coverage is **fight winner (h2h) only** [V]. The scores table has **no tick for MMA or boxing**; tennis has scores on 16 of 47 tournament keys, and each tournament is its own key [V]. Terms allow storing and displaying data in an app, no attribution required, no resale as a data product [V]. Props one event at a time [V]. Free-tier per-second limit, MMA/boxing book counts, and boxing market list: [U]. | V / U |
| SportsGameOdds (`sgo`) | Free "Amateur": 2.5k objects/month, 10 req/min, **10-minute update frequency**, 8 leagues (NFL, NBA, MLB, NHL, NCAAF, NCAAB, Champions League, MLS), results, live scores, box scores, player props, 9 books [V pricing page]. **No tennis, no MMA** [V]. How an "object" is counted, and display terms: [U]. |
| TheRundown (`rundown`) | Free: 20k data points/day, 200k/month, 1 req/s, **5-minute data delay**, no props [V]. Sport ids include UFC/MMA (7), ATP (38), WTA (39), NFL, NBA; no boxing [V]. **Free and Starter plans are internal use only, no display to end users, retention capped at 24 hours** [V licensing page]. So: sentinel/corroboration only. |
| BALLDONTLIE | Free: 5 req/min, one sport, basic data; props need paid [V home page]. NBA box scores only as a late tertiary source. |
| `cdn.nba.com` live JSON, UFCStats, TheSportsDB | NBA CDN returned 403 from here; UFCStats returned a 3 KB stub; TheSportsDB 403. Not usable as designed. | V (blocked) |

Consequence: multi-book prices exist only on the Odds API (and SGO for NFL/NBA); ESPN is a single-book sentinel and the best free live/finals feed; MMA method and round prices exist only on ESPN's one DraftKings feed, so they stay out of v1.

## 2. Provider abstraction and registry

Adding a provider is a config row; code is needed only for a new wire format.

```ts
type Capability = "odds" | "sentinel_odds" | "live_state" | "finals" | "player_stats" | "win_prob" | "schedule";

type ProviderConfig = {
  id: string                       // "odds-api", "espn-site", "espn-core", "sgo", "rundown"
  family: string                   // independence group: "odds-api" (+ compatible resellers), "espn", "sgo", "rundown"
  adapter: "odds-api-v4" | "espn-site" | "espn-core" | "sgo" | "rundown"   // wire format
  baseUrl: string; keyEnv?: string // keys only in env, never logged, never in URLs we store
  enabledEnv: string               // kill switch, as ESPN_RESULTS_ENABLED today
  caps: Partial<Record<Capability, {
    sports: Sport[]                // now includes "mma" | "boxing"
    markets?: MarketKey[]
    books?: "one" | "many"; hasTimestamps?: boolean
    priority: number               // lower = asked first, per capability
    cacheTtlSec?: number           // how long a result stays useful (sets cache TTL)
  }>>
  budget: { unit: "credits" | "requests" | "points"; monthly?: number; daily?: number
            perMinute: number; burst: number; safety: number; dayBurst: number }
  cost: { kind: "per_market_region" | "flat" | "per_object"; estimate(req): number }
  license: { display: boolean; retentionHours?: number }   // rundown: display=false, retention 24
}
```

Rules the router enforces, in order: (1) capability and sport match; (2) `license.display` for anything
that reaches a user (Rundown never appears in a published line or UI); (3) circuit not open; (4)
budget allows the call (monthly cap x safety, daily share x burst, token bucket for per-minute);
(5) lowest `priority`; (6) for odds, keep asking until `minBooks` books are in, merging answers by
book id (what `createCompositeOdds` does today); (7) never count two providers of one `family` toward a
quorum. A reseller that mirrors The Odds API is the same family, which is why `compat` vendors cost
only a config row.

**Budgets.** Reuse both existing mechanisms. Per-minute and burst: the Postgres token bucket
`provider_budgets` with `gate.take/cooldown` (a real 429 sets a shared cooldown) [V:
`lib/provider-budget.ts`]. Monthly and daily: `sports_provider_usage` plus `canSpend` (`credit-budget.ts`),
generalized to units other than credits. Extra: the real quota header (`x-requests-remaining`) is stored
after each Odds API call and *overrides* our own counter when it is lower, so a restart or a second
environment sharing the key cannot overspend.

**Health** (`sports_provider_health`: state, failures, error rate, latency, `open_until`): open after 4 failures in 5 calls or any 401/403; stay open 2, 4, 8 ... 60 min with jitter; one half-open probe. Open circuit = "skipped", so `snapshot.complete=false` and absence proves nothing (existing rule). A required field missing in 20% of events counts as failure.

**Participants.** Add `sports_participants(sport, canonical_name, external_ids jsonb)` for
fighters and players; `sameEvent` matches by canonical id first, normalized name second. A bout is
`(card event, unordered fighter pair)`.

## 3. Request optimisation

### 3.1 Fan-out and caches

One upstream fetch serves everyone because the output is a row, not a response.

- **L0 memory** per server instance: TTL about half the cadence; absorbs overlapping invocations.
- **L1 Postgres** (source of truth): `sports_snapshots(provider, sport, scope, payload_hash, fetched_at, next_due_at)` and `sports_game_state`. The *claim* makes it singleflight across instances: `UPDATE ... SET next_due_at = now() + interval WHERE scope = $1 AND next_due_at <= now() RETURNING` ... one winner polls. Same shape as `claimLiveQuotesSql` [V].
- **L2 CDN**: public state endpoints send `Cache-Control: public, s-maxage=10, stale-while-revalidate=30` plus an ETag from `rev`. Per-user data (my picks, balances) is never in these.
- **Upstream HTTP caching is respected, not fought**: ESPN scoreboard (1 s) is the live source; ESPN core (`max-age` 187-270 s) is finals only.

### 3.2 Who gets polled, and how often

Poll a *sport scope* (one ESPN scoreboard call returns every game of a sport), not a game, and only
if that scope has an interesting game: open picks on it, or a viewer in the last 2 minutes.
`watchers` on each state row is the count of open picks. A scope with no demand is polled at the
5-minute heartbeat at most.

| Game phase | ESPN scoreboard (state + sentinel) | Odds API (metered) |
|---|---|---|
| > 48 h out | schedule sync every 6 h | none; free `/events` for schedule |
| 48 h to 6 h | 30 min | 2 per day per sport, only if the sport has an enabled league |
| 6 h to 1 h | 10 min | one per 2 h |
| 1 h to lock | 60-120 s | one at T-1h and one at T-20min (the consensus anchor before the lock) |
| live (no picks possible) | 60 s if watched, else 5 min | none: in-play odds are out of scope |
| final | every 10 min for 2 h, then hourly until settled | none |

Because the lock stops new picks, **the last Odds API fetch for a game is at about T-20 min**. After that
the quote can only be *suspended* by the sentinel, never repriced, and that is deliberate.

### 3.3 Hard caps and degradation

Every metered provider has monthly cap x 0.9 and a daily cap of 2x an even share (existing).
Over pace means skipped, not failed. Degradation ladder when Odds API credits run out:
(1) existing quotes keep being valid while the sentinel confirms them (up to the tightened max age
below); (2) no new markets are published; (3) markets age out and close with the reason "price too old";
(4) the UI says "Lines paused: waiting on price data". Nothing ever publishes from fewer than 3 books.
Reserve 15% of the monthly cap for incident days; the planner may not touch it unless the
cap is lifted by config.

### 3.4 Worked budgets

Odds API credits (free plan, 450 usable ~ 15/day, 30/day burst). Costs per call: NFL/NBA
`h2h,spreads,totals`, one region = 3; tennis `h2h`, one key per active tournament; MMA/boxing `h2h` = 1.

| Day | Schedule | Credits |
|---|---|---|
| NFL Sunday (14 games, 3 windows) | Sat evening, Sun T-6h, T-2h, T-1h, T-20m for 13:00; one more at 15:45 for 16:05 and 20:00 for 20:20 = 8 calls | 24 |
| NFL rest of week (Tue, Thu, Mon) | ~4 calls | 12 |
| NBA night (10 games, 7-10:30 pm ET) | midday + T-1h + T-20m = 3 calls | 9; at 25 game days a month, 225: too much |
| Tennis day (3 active tournaments, `h2h`) | morning + T-1h for evening matches = 2 calls x 3 keys | 6; month 150 |
| UFC card | T-7d, T-3d, T-1d, T-6h, T-2h, T-30m | 6 per card, ~25/month |
| Boxing | same, one key | ~4 per card |

Sum for NFL (130) + NBA (225) + tennis (150) + fights (30) = 535 > 450. So the free plan needs these
levers, in order: NBA 2 calls on most nights (lines only, props off) = ~150; tennis only for keys with
an enabled league and only the pregame call = ~100; NFL as above = ~130; fights = ~30; total ~410.
It fits, with 40 spare plus the incident reserve, only while SGO takes **NFL and NBA as a second
multi-book source** (its free 10-minute cadence is fine for pregame; its object accounting is [U], so
treat 2.5k objects as ~170 events-per-call fetches a month and verify with its response headers) and
ESPN provides the sentinel. If tennis and NBA both run daily at full cadence, the paid $30/20k plan
is the fallback (per `PROVIDERS.md`), not a v1 need.

ESPN (no stated limit; we self-limit to 40/min, burst 10): NFL Sunday ~650 scoreboard calls (60 s over ~10.5 h) + ~45 core status + up to ~500 `summary` for games with open prop picks, about 1,200 total, peak ~10/min. NBA night ~300 + ~250 summary. Tennis day ~500-960 (ATP+WTA at 90 s, only while a pick is open; ATP payload is ~581 KB raw). UFC card ~330 scoreboard + ~26 core status + ~40 core odds, about 400. Bandwidth is between ESPN and our server, not to users.

## 4. Quote model

```ts
type Quote = {
  id: string; marketId: string; version: number               // monotonically increasing per market
  sideA: { price: number; point: number | null }; sideB: { price: number; point: number | null }
  fairProbA: number; booksUsed: number
  sources: { provider: string; family: string; fetchedAt: Date; bookAt?: Date }[]   // provenance
  observedAt: Date          // oldest contributing fetch: the quote is only as fresh as this
  confirmedAt: Date | null  // last time the sentinel agreed with the baseline
  baseline: { provider: string; fairProbA: number; point: number | null; at: Date }  // sentinel value when cut
  state: "live" | "suspended" | "closed"; supersededAt: Date | null
}
```

Immutable once cut. A new version supersedes the old; old rows stay for audit and for picks pointing
at them.

**Cutting a new version** (poller, never a user): consensus differs from the live quote by >= 3 points
of fair probability or >= 0.5 of the point (tighter than today's 4 points / 1 point because lines are
now live longer), or no live quote exists. Hysteresis: no new version within 5 minutes of the last,
unless the move is >= 2x the threshold.

**Staleness at acceptance** (`now - max(observedAt, confirmedAt)`), tightening toward kickoff:

| Time to start | Max quote age | Sentinel required |
|---|---|---|
| > 24 h | 6 h | no |
| 6 to 24 h | 3 h | no |
| 1 to 6 h | 45 min | if consensus age > 20 min |
| 10 min to 1 h | 12 min | yes, age <= 3 min |
| < 10 min | 4 min | yes, age <= 90 s |

Without a sentinel (tennis has none [V], boxing none [V]) the "yes" rows fall back to the strict max age
only, and for tennis the final-hour max age is 8 min because ATP/WTA lines move on news. That is a
spend of about one extra Odds API call in the last hour, included above.

**Acceptance procedure** (inside the existing `placeSportsPick` transaction, after the market `FOR SHARE`
lock): quote row is `live` and `version == expectedVersion`; price/point equal expected (existing
check); staleness table passes; sentinel check passes (below); event phase `pre` with `phase_age <= 120 s`
in the last hour (fail closed); lock time not reached. Any failure returns a specific code
(`line_moved`, `market_suspended`, `price_too_old`, `market_closed`) and the client shows the new line
if one exists. No silent re-pricing, as today.

**Sentinel check:** `|sentinel.fairProbA - baseline.fairProbA| < 2.5 points` and `|point shift| < 0.5`.
Failure sets the quote `suspended` and schedules an immediate Odds API refresh (claim, budget
permitting). A suspended market reopens as a *new version* from a fresh consensus or closes at lock.
Confirmed means `confirmedAt = now`.

**Protection against stale-line exploitation.** Same price for everybody; one change per cadence,
not per request; the sentinel runs at cadence faster than any user can race; fail closed when it is
silent in the last hour; the per-pick win cap, stake cap, and one pick per market stay (`picks.ts`);
a pick on a suspended market is rejected before the stake leaves the balance. Residual risk: a news
move that shows on no sentinel for a market the sentinel does not cover (tennis, boxing). Mitigation:
tennis lock 45 min early and an 8-minute max age; boxing and tennis totals carry lower stake caps.

**Hard start rule.** `lockAt` is the earliest of: scheduled start minus cushion; for fights, the card
segment start minus 10 min (ESPN gives a per-bout segment `date` [V]); the moment `game_state.phase`
is not `pre`. The scheduler can only move a lock earlier (existing `planSchedule`). Tennis schedules are
"not before" estimates [U] and a match can start early when the prior match ends fast, which is why
tennis gets the 45-minute cushion plus the audit below.

**Post-hoc audit.** On the first observation of live, record `detected_start = first_seen_live_at -
(poll interval + 60 s)`. A settlement step voids and refunds any pick with `accepted_at >=
detected_start`. Rare, conservative, and removes the "one pick slipped in" argument.

## 5. Live state pipeline

### 5.1 Table

```sql
sports_game_state(
  event_id uuid PRIMARY KEY, phase text,        -- pre|live|break|delayed|final|postponed|cancelled|retired
  period int, clock_sec int, display text,
  home_score int, away_score int,
  detail jsonb,        -- tennis {sets:[[6,3],[4,2]], tiebreaks, server?}; fight {round, clock_sec, result:{type,method,round,time}}
  win_prob_home real, win_prob_at timestamptz,  -- NFL/NBA from ESPN summary [V], null elsewhere
  provider text, provider_as_of timestamptz,    -- provider's own clock when it gives one
  seen_at timestamptz, fetched_at timestamptz, rev int, hash text,
  watchers int, next_poll_at timestamptz, poll_interval_s int)
sports_player_stats(event_id, player, stats jsonb, rev, seen_at, PRIMARY KEY(event_id, player))
sports_latency_log(event_id, provider, rev, provider_as_of, seen_at, lag_s)   -- 14-day retention
```

`rev` increments only when the hash changes, so ETags and `since` queries are exact. `seen_at` is
when *we* first saw this state; it is the honest clock for the UI.

### 5.2 Poller

`pollScope(provider, sport)` backs both triggers: a state read that finds `next_poll_at <= now()` and `watchers > 0` runs it in `after()`; the GitHub Actions heartbeat (`*/5` on game days, as in `prices.yml` [V]) also runs it. Vercel's own cron is daily [V: `vercel.json`], so 60-second cadence exists only while someone watches; the UI says so. Expected freshness (headers [V], live behaviour [U]): scoreboard fields at most 60 s old at our edge plus the provider's lag (often 15-60 s behind the broadcast [U]); box scores 2 min; ESPN core UFC `status` up to 4.5 min, used only after a bout is final; Odds API `/scores` ~30 s but absent for fights [V].

### 5.3 Per-pick live status (pure function, shared by server and client)

`liveStatus(pick, state, stats) -> { tone, headline, detail, clinched, asOf }`, tones: `ahead | behind |
even | pending | final_pending | settled`. `clinched` appears only when no future outcome can change
it.

| Market | Headline | Clinched when |
|---|---|---|
| Moneyline | "Ahead by 6" (team sports) | never before final |
| Spread | margin + point, "needs 3 more to cover" | never before final |
| Total (game) | running total vs line, "on pace" omitted (no projection) | Over when running total > point; Under at final only |
| Player prop | stat so far vs line (from `summary` box score), source delay stated | Over when stat >= point (monotonic; marked provisional until settlement) |
| Tennis winner | sets lead, current set score; "retired" surfaced | match final |
| Tennis total games | sum of `linescores`, current set included | Over when sum > point |
| Fight winner | "Round 2, 3:14" or "Final: Win by KO, R1 1:49" | final result flag |
| Fight props (later) | round/clock vs line | per prop |

**Current chance.** NFL and NBA moneylines only: ESPN's `winprobability` last point (home %) [V present
on a finished NFL game; live updating cadence [U]], labelled "ESPN win probability, updated 40s ago".
Spread, total, prop, tennis, and fights get no live chance (no free source). For those the card
shows the *pre-game* fair probability from our quote, labelled "at pick time", never "current". Probability
displays never claim more than the data says.

### 5.4 What the client reads

- `GET /api/sports/state/{sport}/{yyyymmdd}`: all games of the day, a few KB gzipped [U], `s-maxage=10`, ETag from max `rev`, 304 on match. Never per-user.
- `GET /api/sports/leagues/{id}` (existing, per-user): picks and balances, refetched when a pick settles and every 60 s while one is live.
- The client computes `liveStatus` from the two. Poll 20 s while visible with a live pick, 60 s otherwise, paused when hidden, backoff on errors. **SSE/WebSockets rejected**: a held connection occupies a serverless invocation, and 10-20 s lag is within the owner's tolerance.

Cost: one user over a 4-hour NFL window makes ~720 state requests, mostly 304s since state changes only on events. 1,000 concurrent watchers means ~180k edge requests an hour, but the origin sees about 6 a minute per URL per CDN region, each a read of a few dozen rows. DB cost is flat in user count; bandwidth stays under about 1 GB a Sunday with 304s [U on plan limits].

## 6. Settlement

Keep `resolveResult`, `planSettlement`, `applySettlement`, and the ledger idempotency key
`pick:{id}:settle` unchanged [V: `settlement.ts`, `DESIGN.md`]. The extensions are data, not logic.

**Result families by sport.** Distinct families are what count toward `minSources`:

| Sport | Families available | Quorum |
|---|---|---|
| NFL, NBA | espn, odds-api, sgo, (rundown, internal) | 2 of 3 agree |
| Tennis | espn, odds-api (16 of 47 keys only [V]), rundown (scores [U]) | 2 of 3; if only ESPN, `minSources=1` with 12 h delay and an alert |
| MMA/UFC | espn, rundown [U] | espn + rundown; else ESPN alone with 12 h delay and operator spot-check queue |
| Boxing | none [V] | operator confirm, with a source URL and a second admin tick |

A single-family fallback is an explicit config per sport (`quorum`, `extraDelay`), shown on the admin
screen as "weaker settlement", never an implicit default. Credits have no cash value, which is why this is
acceptable; it is not acceptable the day prizes exist.

**Disagreement.** Different final scores or winners: `review` (existing). Review does not hold credits
forever: 7 days then refund (existing). Retirement next to a final: `review`. Tennis totals can now be
computed from `linescores` (games per set, tiebreak shown separately) [V], which removes the "sets or
games" ambiguity that kept tennis totals off; enable after one tournament of cross-check against the Odds
API scores where it exists.

**Delays.** Keep the 6-hour default for props (NBA and NFL box-score edits arrive after the final
[U]), cut game markets to 2 hours, tennis to 1 hour, fights to 6 hours. The UI shows "Final: settling" the
moment a final is seen; credits move later. Stat corrections after settlement are ignored (existing policy).

**Fight grading.** `FightResult = { winner: "a"|"b"|null, type: "ko_tko_dq"|"submission"|"decision"|"draw"|"no_contest"|"dq", round, timeSec }`
mapped from ESPN `result.name` [V names: kotko, submission, decision---unanimous, draw]. Majority and split
decision, DQ, and no-contest names are [U]; unknown names go to `review`.

| Outcome | Winner market | Method / rounds (later) |
|---|---|---|
| Win by KO/TKO/sub/decision/DQ | win for the winner | graded by `type` |
| Draw (majority or technical) | push, refund [V `draw` exists] | decision-type markets: draw counts as "goes the distance" |
| No contest | void | void |
| Opponent changed | void and refund (see below) | void |
| Cancelled or fight removed | void after quorum and delay, or immediately if the event is cancelled and both families say so | void |
| Rounds total | rounds fought = `(period-1) + clock_sec/300` [V: clock counts elapsed seconds]; over 3.5 means more than 3.5 | |

**Fight lifecycle rules.** A market is keyed to the fighter pair. If either fighter changes, or the pair no
longer appears in the Odds API event list *and* ESPN's bout, the market is voided and picks refunded
(opponent changes get a new market, new quote). A moved card time only moves the lock earlier. A bout
dropping off a card is detected from the free `/events` list [V]; removal alone is not enough, it needs a
second signal or 6 hours of absence.

**Void rules added:** pick accepted after the detected start (section 4); market suspended and never
reopened before lock does not void existing picks; no result 72 h after start still voids (existing).

## 7. Failure modes

| Failure | Behaviour |
|---|---|
| Odds API out of credits or down | markets age out (3.3); sentinel extends validity only while confirming; no new lines |
| ESPN down or drifted | live view says "Live data unavailable"; picks stay open; sentinel absent, so final-hour markets suspend |
| ESPN serves stale JSON | unchanged `hash` for 3+ polls in a live game flags "stalled" to users |
| Provider start differs (early tennis) | first non-pre observation locks; audit voids stragglers |
| Cron missed or duplicated | next claim or heartbeat recovers; one claim winner; `rev`-gated writes |
| Name mismatch | no publish, no settle; alias table; review queue |
| Quota drift across environments | Odds API remaining-quota header overrides our counter |
| Results sources down | nothing settles or voids (existing); owner alert after 12 h |

## 8. Phased rollout (in build order)

1. **Instrumentation first** (1-2 days): `sports_latency_log` and a script that polls ESPN
   scoreboards read-only through one NFL Sunday, one NBA night, one tennis day, and this Saturday's UFC
   card (Buckley vs Malott, 21:00Z/00:00Z start [V]) with no picks involved. Measures real update lag
   and ESPN's early-tennis-start rate. This turns every [U] about live behaviour into data.
2. **Registry and budgets**: `ProviderConfig`, router, health table, usage generalized beyond credits,
   quota-header override, ESPN registered as `live_state`, `finals`, `sentinel_odds`.
3. **Quote versions and the acceptance procedure**: migration for `sports_quotes` (additive),
   `quote_version` on picks, staleness table, sentinel check, `lockAt` rules. Remove the 2-hour lock; the
   new lock is the cushion plus phase check. Replace "freeze forever" with `suspended` and new versions.
4. **Game state poller and public endpoint** with CDN headers; client hook with visibility pause and ETag;
   `liveStatus` for moneyline, spread, total. Add honest freshness labels.
5. **Props and tennis live**: `summary` box scores for open prop picks; tennis linescores; win probability for NFL/NBA moneylines.
6. **Fights**: sport kinds `mma`, `boxing`; `FightResult`; winner market from Odds API h2h only if the
   consensus has >= 3 books [U for MMA]; ESPN status as settlement; boxing through the operator queue; add
   Rundown (UFC) when its key and scores are verified. Fight props (method, rounds) wait for a second
   quoting family.
7. **Second families**: SGO for NFL/NBA odds and results; Rundown for corroboration only.

**What to test.** Table-driven units for the staleness table, sentinel check and `liveStatus`; DB races (pick vs new version, lock, suspend) in `sports:stress`; a replay harness feeding recorded ESPN sequences (this UFC card, one NFL Sunday) through poller, lock and settlement; fixture contract tests that fail when a verified ESPN field disappears; fake-clock budget tests (never overspend, reserve respected); each provider failing in turn. Invariant: no pick accepted when `now >= lockAt` or phase is not `pre`.

**What to measure.** Provider-timestamp vs first-seen lag per provider and sport (p50/p95); quote age at acceptance and the share rejected as `price_too_old`/`line_moved`/`market_suspended`; sentinel disagreement rate; credits per day vs plan; polls per scope per hour; early tennis start rate; final-to-settle time; review rate.

## 9. Out of scope

Live or in-play betting and cash-out; parlays; anything real-money or prize-related (needs compliance review first); SSE/WebSockets; tennis props; fight method and round markets until a second family quotes them; automated boxing settlement; other sports; push delivery (the outbox exists); paid plans as a v1 dependency; scraping sites without an API (UFCStats, BoxRec); showing raw bookmaker names or prices.
